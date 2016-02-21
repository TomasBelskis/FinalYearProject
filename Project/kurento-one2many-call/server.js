/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 2.1 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-2.1.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 */

var path = require('path');
var url = require('url');
var express = require('express');
var minimist = require('minimist');
var ws = require('ws');
var kurento = require('kurento-client');
var fs    = require('fs');
var https = require('https');


//sets kurento client url 8888, kurento client running on port 8888, and access url both on port 8443 
var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'https://52.49.81.164:8443/',
        ws_uri: 'ws://52.49.81.164:8888/kurento'
    }
});

//https certs
var options =
{
  key:  fs.readFileSync('keys/server.key'),
  cert: fs.readFileSync('keys/server.crt')
};
//express framework
var app = express();

/*
 * Definition of global variables.
 */
var viewerCount=0;
var idCounter = 0;
var candidatesQueueCam = {};
var candidatesQueueScreen = {};
var kurentoClient = null;
var presenter = null;
var viewers = [];
var viewer = null;
var noPresenterMessage = 'No active presenter. Try again later...';

/*
 * Server startup
 */
 //parsing url
var asUrl = url.parse(argv.as_uri);
//selectig port from url
var port = asUrl.port;
//creating https server on port
var server = https.createServer(options, app).listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});

// new websocket server
var wss = new ws.Server({
    server : server,
    path : '/one2many'
});

//creating session id for new viewer clients
function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws) {
	//creates a session id
	var sessionId = nextUniqueId();
	console.log('Connection received with sessionId ' + sessionId);
	//logging errors 
    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });
	//closing websocket
    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    //message processing
    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);
        //dealing with messages passed on websocket
        switch (message.id) {
        case 'presenter':
			startPresenter(sessionId, ws, message.pSdpOfferCam, message.pSdpOfferScreen, function(error, pSdpAnswerCam, pSdpAnswerScreen) { // starts presenter by sending sessionID, websocket and sdpoffer
				if (error) {
					return ws.send(JSON.stringify({
						id : 'presenterResponse',
						response : 'rejected',
						message : error
					}));
				}
				ws.send(JSON.stringify({
					id : 'presenterResponse',
					response : 'accepted',
					pSdpAnswerCam : pSdpAnswerCam,
					pSdpAnswerScreen : pSdpAnswerScreen
				}));
			});
			break;

        case 'viewer':
			startViewer(sessionId, ws, message.vSdpOfferCam, message.vSdpOfferScreen, function(error, vSdpAnswerCam, vSdpAnswerScreen) {
				if (error) {
					return ws.send(JSON.stringify({
						id : 'viewerResponse',
						response : 'rejected',
						message : error
					}));
				}
					ws.send(JSON.stringify({
						id : 'viewerResponse',
						response : 'accepted',
						vSdpAnswerCam : vSdpAnswerCam,
						vSdpAnswerScreen : vSdpAnswerScreen
					}));	
				});
			break;

        case 'stop':
            stop(sessionId);
            break;

        case 'onIceCandidateCam':
            onIceCandidateCam(sessionId, message.candidate);
            break;
            
		case 'onIceCandidateScreen':
			onIceCandidateScreen(sessionId, message.candidate);
			break;
			
		case 'errorSendOffer':
			console.log('Error offer not send by the presenter: ' + message.errorOffer);
			break;
			
        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : 'Invalid message ' + message
            }));
            break;
        }
    });
});

/*
 * Definition of functions
 */

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(argv.ws_uri, function(error, _kurentoClient) { //function that is part of instanciating a kurento client
        if (error) {
            console.log("Could not find media server at address " + argv.ws_uri);
            return callback("Could not find media server at address" + argv.ws_uri
                    + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function startPresenter(sessionId, ws, pSdpOfferCam, pSdpOfferScreen, callback) {
	clearCandidatesQueue(sessionId);
	
	/*if (presenter !== null) {
		stop(sessionId);
		return callback("Another user is currently acting as presenter. Try again later ...");
	}*/
	var presenterSdpAnswerCam =null;
	var presenterSdpAnswerScreen=null;
	
	console.log('Starting presenter with sdpOfferCam: ' + pSdpOfferCam + ' and sdpOfferScreen:' + pSdpOfferScreen);
	
	presenter = {
		id : sessionId,
		pipeline : null,
		webRtcEndpointCam : null,
		webRtcEndpointScreen: null
	}

	getKurentoClient(function(error, kurentoClient) {
		if (error) {
			stop(sessionId);
			return callback(error); 
		}

		if (presenter === null) {
			stop(sessionId);
			return callback(noPresenterMessage);
		}

		kurentoClient.create('MediaPipeline', function(error, pipeline) {
			if (error) {
				stop(sessionId);
				return callback(error);
			}

			if (presenter === null) {
				stop(sessionId);
				return callback(noPresenterMessage);
			}

			presenter.pipeline = pipeline;
			
			//Cam Endpoint
			console.log('Cam Endpoint creation got called');
			
				pipeline.create('WebRtcEndpoint', function(error, webRtcEndpointCam) {
					if (error) {
						stop(sessionId);
						return callback(error);
					}
	
					if (presenter === null) {
						stop(sessionId);
						return callback(noPresenterMessage);
					}
	
					presenter.webRtcEndpointCam = webRtcEndpointCam;
					
	
	                if (candidatesQueueCam[sessionId]) {
	                    while(candidatesQueueCam[sessionId].length) {
	                        var candidate = candidatesQueueCam[sessionId].shift();
	                        webRtcEndpointCam.addIceCandidate(candidate);
	                    }
	                }
	
	                webRtcEndpointCam.on('OnIceCandidate', function(event) {
	                    var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
	                    ws.send(JSON.stringify({
	                        id : 'iceCandidateCam',
	                        candidate : candidate
	                    }));
	                });
	                
					webRtcEndpointCam.processOffer(pSdpOfferCam, function(error, sdpAnswerCam) {
						if (error) {
							stop(sessionId);
							return callback(error);
						}
	
						if (presenter === null) {
							stop(sessionId);
							return callback(noPresenterMessage);
						}
						presenterSdpAnswerCam=sdpAnswerCam;
						//callback(null, sdpAnswerCam);
					});
					
	
	                webRtcEndpointCam.gatherCandidates(function(error) {
	                    if (error) {
	                        stop(sessionId);
	                        return callback(error);
	                    }
	                });
	                
	            });
	            	
				//Screen Endpoint 
				console.log('Screen Endpoint creation got called');
				pipeline.create('WebRtcEndpoint', function(error, webRtcEndpointScreen) {
					
					//error checking
					if (error) {
						stop(sessionId);
						return callback(error);
					}
	
					if (presenter === null) {
						stop(sessionId);
						return callback(noPresenterMessage);
					}
					//attaching enpoint to presenter object
					presenter.webRtcEndpointScreen = webRtcEndpointScreen;
	
					//adding ice candates to endpoint
	                if (candidatesQueueScreen[sessionId]) {
	                    while(candidatesQueueScreen[sessionId].length) {
	                        var candidate = candidatesQueueScreen[sessionId].shift();
	                        webRtcEndpointScreen.addIceCandidate(candidate);
	                      
	                    }
	                }
	                webRtcEndpointScreen.on('OnIceCandidate', function(event) {
	                    var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
	                    ws.send(JSON.stringify({
	                        id : 'iceCandidateScreen',
	                        candidate : candidate
	                    }));
	                });
					webRtcEndpointScreen.processOffer(pSdpOfferScreen, function(error, sdpAnswerScreen) {
						if (error) {
							stop(sessionId);
							return callback(error);
						}
	
						if (presenter === null) {
							stop(sessionId);
							return callback(noPresenterMessage);
						}
						callback(null, presenterSdpAnswerCam, sdpAnswerScreen);
					});
	
	                webRtcEndpointScreen.gatherCandidates(function(error) {
	                    if (error) {
	                        stop(sessionId);
	                        return callback(error);
	                    }
	                });
	            });
				//Screen endpoint code end	
        });
	});
}
            
function startViewer(sessionId, ws, vSdpOfferCam, vSdpOfferScreen, callback) {
	clearCandidatesQueue(sessionId);
	
	console.log('Starting viewer with sdpOfferCam: ' + vSdpOfferCam + ' and sdpOfferScreen:' + vSdpOfferScreen);
	
	var viewerSdpAnswerCam =null;
	var viewerSdpAnswerScreen=null;
	
	viewer={
		webRtcEndpointCam : null,
		webRtcEndpointScreen : null,
		ws : ws
	}
	
	if (presenter === null) {
		stop(sessionId);
		return callback(noPresenterMessage);
	}
	
	//Linking cam endpoints between presenter and viewer
	presenter.pipeline.create('WebRtcEndpoint', function(error, webRtcEndpointCam) {
		if (error) {
			stop(sessionId);
			return callback(error);
		}
		
		viewer.webRtcEndpointCam=webRtcEndpointCam;
		
		if (presenter === null) {
			stop(sessionId);
			return callback(noPresenterMessage);
		}

		if (candidatesQueueCam[sessionId]) {
			while(candidatesQueueCam[sessionId].length) {
				var candidate = candidatesQueueCam[sessionId].shift();
				webRtcEndpointCam.addIceCandidate(candidate);
			}
		}

        webRtcEndpointCam.on('OnIceCandidate', function(event) {
            var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
            ws.send(JSON.stringify({
                id : 'iceCandidateCam',
                candidate : candidate
            }));
        });

		webRtcEndpointCam.processOffer(vSdpOfferCam, function(error, vSdpAnswerCam) {
			if (error) {
				stop(sessionId);
				return callback(error);
			}
			if (presenter === null) {
				stop(sessionId);
				return callback(noPresenterMessage);
			}

			presenter.webRtcEndpointCam.connect(webRtcEndpointCam, function(error) {
				if (error) {
					stop(sessionId);
					return callback(error);
				}
				if (presenter === null) {
					stop(sessionId);
					return callback(noPresenterMessage);
				}
				
				viewerSdpAnswerCam=vSdpAnswerCam;
				//callback(null, vSdpAnswerCam);
		        webRtcEndpointCam.gatherCandidates(function(error) {
		            if (error) {
			            stop(sessionId);
			            return callback(error);
		            }
		        });
		    });
	    });
	});
	

	//linking Screen endpoints
		presenter.pipeline.create('WebRtcEndpoint', function(error, webRtcEndpointScreen) {
		if (error) {
			stop(sessionId);
			return callback(error);
		}
		
		viewer.webRtcEndpointScreen=webRtcEndpointScreen;
		
		if (presenter === null) {
			stop(sessionId);
			return callback(noPresenterMessage);
		}

		if (candidatesQueueScreen[sessionId]) {
			while(candidatesQueueScreen[sessionId].length) {
				var candidate = candidatesQueueScreen[sessionId].shift();
				webRtcEndpointScreen.addIceCandidate(candidate);
			}
		}
        webRtcEndpointScreen.on('OnIceCandidate', function(event) {
            var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
            ws.send(JSON.stringify({
                id : 'iceCandidateScreen',
                candidate : candidate
            }));
        });

		webRtcEndpointScreen.processOffer(vSdpOfferScreen, function(error, vSdpAnswerScreen) {
			if (error) {
				stop(sessionId);
				return callback(error);
			}
			if (presenter === null) {
				stop(sessionId);
				return callback(noPresenterMessage);
			}

			presenter.webRtcEndpointScreen.connect(webRtcEndpointScreen, function(error) {
				if (error) {
					stop(sessionId);
					return callback(error);
				}
				if (presenter === null) {
					stop(sessionId);
					return callback(noPresenterMessage);
				}
				
				callback(null, viewerSdpAnswerCam, vSdpAnswerScreen);
				
		        webRtcEndpointScreen.gatherCandidates(function(error) {
		            if (error) {
			            stop(sessionId);
			            return callback(error);
		            }
		        });
		    });
	    });
	});
	//end of Screen endpoint link
	viewers[sessionId] = viewer;
	
	viewerCount++;
	console.log("Viewer has joined current = Viewer Count: " + viewerCount);
	
}

function clearCandidatesQueue(sessionId) {
	if (candidatesQueueCam[sessionId]) {
		delete candidatesQueueCam[sessionId];
	}
	if (candidatesQueueScreen[sessionId]) {
		delete candidatesQueueScreen[sessionId];
	}
}

function stop(sessionId) {
	if (presenter !== null && presenter.id == sessionId) {
		for (var i in viewers) {
			 viewer = viewers[i];
			if (viewer.ws) {
				viewer.ws.send(JSON.stringify({
					id : 'stopCommunication'
				}));
			}
		}
		presenter.pipeline.release();
		presenter = null;
		viewers = [];

	}else if(viewers[sessionId]){
		viewers[sessionId].webRtcEndpointCam.release();
		viewers[sessionId].webRtcEndpointScreen.release();
		delete viewers[sessionId];
	}
	
	clearCandidatesQueue(sessionId);
	console.log("Viewer has left current = Viewer Count: " + viewerCount);
}
/*
function onIceCandidateCam(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (presenter && presenter.id === sessionId && presenter.webRtcEndpointCam ) { //&& presenter.webRtcEndpointScreen
        console.info('Sending presenter cam candidate');
        presenter.webRtcEndpointCam.addIceCandidate(candidate);
     	//presenter.webRtcEndpointScreen.addIceCandidate(candidate);
           
    }else if(presenter && presenter.id === sessionId && presenter.webRtcEndpointScreen ) {
	    presenter.webRtcEndpointScreen.addIceCandidate(candidate);
    }else if (viewers[sessionId] && viewers[sessionId].webRtcEndpointCam  ) { //&&viewers[sessionId].webRtcEndpointScreen
        console.info('Sending viewer cam candidate');
        viewers[sessionId].webRtcEndpointCam.addIceCandidate(candidate);
       // viewers[sessionId].webRtcEndpointScreen.addIceCandidate(candidate);
    }else if(viewers[sessionId] && viewers[sessionId].webRtcEndpointScreen ){
	 viewers[sessionId].webRtcEndpointScreen.addIceCandidate(candidate);
	    
    } else {
        console.info('Queueing candidate');
        if (!candidatesQueueCam[sessionId]) {
            candidatesQueueCam[sessionId] = [];
        }
        candidatesQueueCam[sessionId].push(candidate);
    }
}*/
function onIceCandidateCam(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (presenter && presenter.id === sessionId && presenter.webRtcEndpointCam) {
        console.info('Sending presenter cam candidate');
        presenter.webRtcEndpointCam.addIceCandidate(candidate);
    }
    else if (viewers[sessionId] && viewers[sessionId].webRtcEndpointCam) {
        console.info('Sending viewer scam candidate');
        viewers[sessionId].webRtcEndpointCam.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!candidatesQueueCam[sessionId]) {
            candidatesQueueCam[sessionId] = [];
        }
        candidatesQueueCam[sessionId].push(candidate);
    }
}
function onIceCandidateScreen(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (presenter && presenter.id === sessionId && presenter.webRtcEndpointScreen) {
        console.info('Sending presenter screen candidate');
        presenter.webRtcEndpointScreen.addIceCandidate(candidate);
    }
    else if (viewers[sessionId] && viewers[sessionId].webRtcEndpointScreen) {
        console.info('Sending viewer screen candidate');
        viewers[sessionId].webRtcEndpointScreen.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!candidatesQueueScreen[sessionId]) {
            candidatesQueueScreen[sessionId] = [];
        }
        candidatesQueueScreen[sessionId].push(candidate);
    }
}

/*
function onIceCandidateScreen(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (presenter && presenter.id === sessionId && presenter.webRtcEndpointScreen ) { //&& presenter.webRtcEndpointScreen
        console.info('Sending presenter screen candidate');
        presenter.webRtcEndpointCam.addIceCandidate(candidate);
     	//presenter.webRtcEndpointScreen.addIceCandidate(candidate);
           
    }else if(presenter && presenter.id === sessionId && presenter.webRtcEndpointScreen ) {
	    presenter.webRtcEndpointScreen.addIceCandidate(candidate);
    }else if (viewers[sessionId] && viewers[sessionId].webRtcEndpointCam  ) { //&&viewers[sessionId].webRtcEndpointScreen
        console.info('Sending viewer screen candidate');
        viewers[sessionId].webRtcEndpointCam.addIceCandidate(candidate);
       // viewers[sessionId].webRtcEndpointScreen.addIceCandidate(candidate);
    }else if(viewers[sessionId] && viewers[sessionId].webRtcEndpointScreen ){
	 viewers[sessionId].webRtcEndpointScreen.addIceCandidate(candidate);
	    
    } else {
        console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueueScreen[sessionId].push(candidate);
    }
}*/

app.use(express.static(path.join(__dirname, 'static')));

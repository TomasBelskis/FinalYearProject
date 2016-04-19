

var path = require('path');
var url = require('url');
var express = require('express');
var minimist = require('minimist');
var ws = require('ws');
var bodyParser = require('body-parser');//body parser added remove if broken
//var multer = require('multer');
var Busboy = require('busboy');
var kurento = require('kurento-client');
var fs    = require('fs');
var https = require('https');
//var multer = require('multer');
var channelsURL = 'project-vm.cloudapp.net:4080';

var chWs =  new ws('ws://' + channelsURL);

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


//var upload = multer({dest: './static/uploads/'}).single('singleFile');//multer upload

//express framework
var app = express();

app.set('view engine', 'ejs');

//app.use(bodyParser.urlencoded({extended: true}));
//app.use(bodyParser.json());
//app.use(multer({dest:'./uploads/'}).single('singleFile'));

/*
 * Definition of global variables.
 */
var viewerCount=0;
var idCounter = -1;
var candidatesQueueCam = {};
var candidatesQueueScreen = {};
var kurentoClient = null;
var presenter = null;
var viewers = [];
var viewer = null;
var presenterList=[];
var clientsList=[];
var client_names=[];
var clientSessionIds=[];
var clientCounter=0;
var observer=null;
var observers = [];
var controlSessionID;
var recordingsSessionID;
var uploadedFiles=[];
var fileCounter=0;
var videoStreamType;
var presenterState='offline'; // State of channels if presenter is streaming or not
var noPresenterMessage = 'No active presenter. Try again later...';
var fileDir = "./static/uploads";
var pdfDir = "./static/pdfs";
var lastRenderedPdf;
var recDir = './static/recordings/';
var fileList = fs.readdirSync(fileDir);

/*
 * Server startup
 */
 //parsing url
var asUrl = url.parse(argv.as_uri);
//selectig port from url
var port = asUrl.port;

//creating https server on port
var server = https.createServer(options, app).listen(port, function() {
    console.log('Application Server has started! ');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});

// new websocket server
var wss = new ws.Server({
    server : server,
    path : '/broadcasting'
});

var gws;// global websocket 

//creating session id for new viewer clients
function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

//websocket broadcast function that sends message to all 
//clients that are connected to the socket invoke using wss.broadcast 
//later in the server
wss.broadcast = function(data) {
  for (var i in this.clients)
    this.clients[i].send(data);
};

/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws) {
	
	gws=ws;//setting global websocket 
	
	//creates a session id
	var sessionId = nextUniqueId();
	clientsList[sessionId]=ws;
	console.log('Connection received with sessionId ' + sessionId);
	console.log('Clients list after connection!!!: ' + clientsList + ' Length of clientList :' + clientsList.length);
	
	
	
	for(f in fileList){
		console.log(' File array: ' + fileList[f]);
	}
	
	ws.send(JSON.stringify({
		id:'fileList',
		files : fileList
	}));
	
	//logging errors 
    ws.on('error', function(error) {
        console.log('Websocket error : Connection ' + sessionId + ' error');
        stop(sessionId);
    });
    
	//closing websocket
    ws.on('close', function() {
        console.log('Websocket closing : Connection ' + sessionId + ' closed');
		var indexOfClient = clientSessionIds.indexOf(sessionId);
		
	
        
        if(sessionId>-1) 
        {
	       
	       	delete clientsList[sessionId];
        	//clientsList.splice(sessionId, 1); //remove client based on session id in order to not store empty clients
        	console.log('Clients list after a client has left!!!: '+ clientsList + 'Clients list array lenght after splicing: ' + clientsList.length);
        }
        
        if(indexOfClient>-1){
	        
	    	clientSessionIds.splice(indexOfClient, 1);
	    	clientCounter--;
	    	console.log('Clients sessionID list after a client has left!!!: '+ clientSessionIds + 'Clients list array lenght after splicing: ' + clientSessionIds.length);
        }
    
       
        stop(sessionId);
    });

    //message processing
    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);
        //dealing with messages passed on websocket
        switch (message.id) {
	        
	    case 'presntableClientConnect': 
	    	console.log('Socket connection with presentabl page established! session id: ' + sessionId);
	    	
	    	
			clientSessionIds[clientCounter]=sessionId;
	    	clientCounter++;
	    	
	    	break;
	    
	    case 'clientRecordingsPage':
	    	console.log('Socket connection with recordings page established! session id: ' + sessionId);
	    	recordingsSessionID = sessionId;
	    	break;
	    
	    case 'controlClientJoined':
	    	console.log('Socket connection with control client established! session id: ' + sessionId);
	    	controlSessionID = sessionId;
	    	break;
	
        case 'presenter':
			startPresenter(sessionId, ws, message.pSdpOfferCam, message.pSdpOfferScreen, message.control, function(error, pSdpAnswerCam, pSdpAnswerScreen) { // starts presenter by sending sessionID, websocket and sdpoffer
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
			
		case 'observer':
			startObserver(sessionId, ws, clientSessionIds);
			break;
			
		case 'chat':
			var chatMsg = message.chatMessage;
			wss.broadcast(JSON.stringify({
				id : 'chatResponse',
				chatMessage : chatMsg
				}));			
			break;
			
		case 'streamTypeRequest':
			ws.send(JSON.stringify({
				id: 'typeResponse',
				streamType : videoStreamType
			}));
			break;
			
		case 'observerCalledPresenter': //Control starting presenter
			if(presenter!==null){	
				//Sending message to stop the current presenter which kills all the clients
				console.log("Closing current presenter!: Presenter ID :" + presenter.id + " New Presenter ID: " + message.newPresenterID);
				
				clientsList[presenter.id].send(JSON.stringify({
					
					id: 'controlClosePresenter',
					streamType : message.streamType,
					presenterID: presenter.id,
					newPresenterID : message.newPresenterID
					
				}));
				
			}else{//Control starts presenter when none are presenting
				console.log("Observer starting presenter when presenter is null" + message.newPresenterID);
				//Sending message to a client to initiatie it to present
				clientsList[message.newPresenterID].send(JSON.stringify({
					id : 'observerStartPresenterClient',
					streamType : message.streamType,
					newPresenterID : message.newPresenterID
				}));
			}
			break;
			
		case 'controlClosedPresenter':
		
			//Sending message to start the presenter after the message from client received that current presenter is closed
			console.log("Old Presenter closed new presenter starting with id: " + message.newPresenterID + " Old Presenter ID: " + message.presenterID);
			clientsList[message.newPresenterID].send(JSON.stringify({
				id : 'observerStartPresenterClient',
				streamType : message.streamType,
				presenterID : message.presenterID,
				newPresenterID : message.newPresenterID
			}));
			break;
			
		case 'restartViewers':
			//Send message to start viewers except the presenter
			console.log("Received message to restart viewers!")
			sendMessageToRestartViewers();
			break;
		
		case 'renderPdfUpload':
		 lastRenderedPdf = message.dir + message.fileName;
		
		 console.log("files directory: " + message.dir);
		
			wss.broadcast(JSON.stringify({
				id : 'renderPdfUploadToClients',
				dir : lastRenderedPdf,
				filename : message.fileName
				}));
				
			break;
			
		case 'fileListRequest':
		
			ws.send(JSON.stringify({
				id:'fileList',
				files : fileList
			}));
			break;
		
		case 'getAllRecordings':
			var recList = fs.readdirSync(recDir);
			ws.send(JSON.stringify({
				id:'recList',
				recList : recList
				}));
			break;
		case 'deleteRecording':
			console.log("Deleting Recording: " + message.dir + message.file);
			
			var tmpRec = recDir+message.file;
			fs.unlink(tmpRec, function(error){
				if(error) console.log('Error unlinking file! ' +error);
				else console.log('Succesfully removed file!!' + tmpRec);
			});
			break;
			
		case 'presenterIsLive':
			presenterState = 'live';
			channelState(presenterState);
			break;
			
        case 'stop':
        	console.log('Stoping client with sessions' + sessionId);
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

function startPresenter(sessionId, ws, pSdpOfferCam, pSdpOfferScreen, control, callback) {
	clearCandidatesQueue(sessionId);
	
	
	//Another presenter client had been opened and a presenter is attempting to present (not by control)
	if (presenter !== null&&control==false) {
		stop(sessionId);
		return callback("Another user is currently acting as presenter. Try again later ...");
	}

	
	var presenterSdpAnswerCam=null;
	var presenterSdpAnswerScreen=null;
	
	//location for webcam recordings to be stored
	var camRecordingURI={
		uri:'file:///home/ubuntu/Project/NewProject/BroadcastingServer/static/recordings/camRecording.webm'
	};
	
	//location for screnshare recordings to be stored
	var screenRecordingURI={
		mediaProfile: 'WEBM_VIDEO_ONLY',
		uri:'file:///home/ubuntu/Project/NewProject/BroadcastingServer/static/recordings/screenRecording.webm'
	};
	
	
	console.log('Starting presenter sessionID: '+ sessionId + ' with sdpOfferCam: ' + pSdpOfferCam + ' and sdpOfferScreen:' + pSdpOfferScreen + 'started by control: ' + control);
	//Presenter object that keeps track of session id that is currently presenting and endpoints tha are created on presenter side of the media pipeline
	presenter = {
		id : sessionId,
		pipeline : null,
		recorderEndpointCam : null,
		recorderEndpointScreen : null,
		webRtcEndpointCam : null,
		webRtcEndpointScreen: null
	}
	
	//Gets instance of kurento client which is returned in a callback function
	getKurentoClient(function(error, kurentoClient) {
		if (error) {
			stop(sessionId);
			return callback(error); 
		}

		if (presenter === null) {
			stop(sessionId);
			return callback(noPresenterMessage);
		}
		
		//creates a media pipeline
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
			
			
			if(pSdpOfferCam!=null&&pSdpOfferScreen!=null){//Cam and Screen share stream
				videoStreamType='camAndScreen';
				
				// Recorder enedpoint for recording cam stream
				
				pipeline.create('RecorderEndpoint', camRecordingURI, function(error, recorderEndpointCam){
				
					if(error){
						console.log('Recording error');
						return callback(error);
					}else{
						console.log('Recording started');
					}
					
					presenter.recorderEndpointCam=recorderEndpointCam;
					
				
					
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
						
						webRtcEndpointCam.connect(recorderEndpointCam);
						recorderEndpointCam.record();
		
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
	            });
	            
	            //Recording endpoint for screen
	            pipeline.create('RecorderEndpoint', screenRecordingURI, function(error, recorderEndpointScreen){
		            
		            if(error){
			            console.log('Recording screen error');
			            return callback(error);
		            }else{
			            console.log('Recording started');
		            }
		            
		            presenter.recorderEndpointScreen = recorderEndpointScreen;
		            
		            
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
							
							webRtcEndpointScreen.connect(recorderEndpointScreen);
							recorderEndpointScreen.record();
		            
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
			                
		            });//End of screen endpoint
		            
				});//End of recorder endpoint
			}else if(pSdpOfferCam!=null&&pSdpOfferScreen==null){//Only camera stream
				
				videoStreamType='cam';
			
				pipeline.create('RecorderEndpoint', camRecordingURI, function(error, recorderEndpointCam){ 
					
					if(error){
						console.log('Recorder Endpoint cam error');
						return callback(error);	
					}else{
						console.log('Recording started');
					}
					
				
					presenter.recorderEndpointCam = recorderEndpointCam;
			
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
						webRtcEndpointCam.connect(recorderEndpointCam);	
						recorderEndpointCam.record();
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
							
							
							//presenterSdpAnswerCam=sdpAnswerCam;
							callback(null, sdpAnswerCam, null);
		               
						});
						
						
						
		                webRtcEndpointCam.gatherCandidates(function(error) {
		                    if (error) {
		                        stop(sessionId);
		                        return callback(error);
		                    }
		                });
		                
	            	});//end of cam endpoint
	          
	          });//end of cam recording endpoint
	          
			}else if(pSdpOfferCam==null&&pSdpOfferScreen!=null){//screen stream only
				videoStreamType='screen';
				
				pipeline.create('RecorderEndpoint', screenRecordingURI, function(error, recorderEndpointScreen){
					if(error){
					
						console.log('Recorder endpoint screen error');
						return callback(error);
					
					}else{
						console.log('Recording has started');
					}
					
					presenter.recorderEndpointScreen = recorderEndpointScreen;
					
					recorderEndpointScreen.record();
					
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
						
						webRtcEndpointScreen.connect(recorderEndpointScreen);
												
						recorderEndpointScreen.record();

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
							
							callback(null, null, sdpAnswerScreen);
						});
		
		                webRtcEndpointScreen.gatherCandidates(function(error) {
		                    if (error) {
		                        stop(sessionId);
		                        return callback(error);
		                    }
		                });
		            });//End of screen endpoint
					
				
				});//End of screen recorder endpoint
			}
        });
	});
}
            
function startViewer(sessionId, ws, vSdpOfferCam, vSdpOfferScreen, callback) {
	clearCandidatesQueue(sessionId);
	
	var vCamRecordingURI={
		uri:'file:///home/ubuntu/Project/NewProject/kurento-one2many-call/static/recordings/vVcamRecording.webm'
	};
	
	console.log('Starting viewer with sdpOfferCam: ' + vSdpOfferCam + ' and sdpOfferScreen:' + vSdpOfferScreen);
	
	var viewerSdpAnswerCam =null;
	var viewerSdpAnswerScreen=null;
	
	
	viewer={
		webRtcEndpointCam : null,
		webRtcEndpointScreen : null,
		ws : ws
	};
	
	if (presenter === null) {
		stop(sessionId);
		return callback(noPresenterMessage);
	}
	if(vSdpOfferCam!=null&&vSdpOfferScreen!=null){
		
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
		});//end of Screen endpoint link
	}else if(vSdpOfferCam!=null&&vSdpOfferScreen==null){//cam view only
		
		presenter.pipeline.create('RecorderEndpoint',vCamRecordingURI, function(error,recorderEndpoint){
		
		    if(error){
			            console.log('viewer side Recording screen error');
			            return callback(error);
		            }else{
			            console.log('Viwer side Recording started');
		            }
		
		recorderEndpoint.record();
		
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
					
					webRtcEndpointCam.connect(recorderEndpoint,function (error){
						if(error) console.log('Viewer recording error');
					});
					
					
					callback(null, vSdpAnswerCam, null);
			        webRtcEndpointCam.gatherCandidates(function(error) {
			            if (error) {
				            stop(sessionId);
				            return callback(error);
			            }
			        });
			        
			    });
			    
		    });
		});
	});
	}else{
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
					
					callback(null, null, vSdpAnswerScreen);
					
			        webRtcEndpointScreen.gatherCandidates(function(error) {
			            if (error) {
				            stop(sessionId);
				            return callback(error);
			            }
			        });
			    });
		    });
		});//end of Screen endpoint link
	}
	
	viewers[sessionId] = viewer;
	
	viewerCount++;
	
	console.log("Viewer has joined current = Viewer Count: " + viewerCount + "Viewers Session ID: " + sessionId);
	
	wss.broadcast(JSON.stringify({
		id : 'viewerJoined',
		vCount : viewerCount
	}));
}

function startObserver(sessionId, ws, cList){
	if(observer!=null){
		alert("observer already exists");
	}
	
	console.log("Observer has joined" + sessionId);
	
	observers[sessionId]=ws;
	
	observers[sessionId].send(JSON.stringify({
			id: 'observerClientList',
			clientList : cList
		}));
	
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
		presenterState='offline';
		channelState(presenterState);
		
	}

	if(typeof viewer != "undefined" && viewer != null && viewer.length > 0){
		
		if(viewers[sessionId].webRtcEndpointCam!=null&&viewers[sessionId].webRtcEndpointScreen!=null){
			
			console.log('Closing session:'+ sessionId + 'Cam and Screen!!');
			
			viewers[sessionId].webRtcEndpointCam.release();
			viewers[sessionId].webRtcEndpointScreen.release();
			
			delete viewers[sessionId];
			
		}else if(viewers[sessionId].webRtcEndpointCam!=null&&viewers[sessionId].webRtcEndpointScreen==null){
			
			viewers[sessionId].webRtcEndpointCam.release();
			
			delete viewers[sessionId];
			
		}else if(observers[sessionId]){
			
			delete observers[sessionId];
			 	
		}else{
			
			viewers[sessionId].webRtcEndpointScreen.release();
			
			delete viewers[sessionId];
		}
	}
	clearCandidatesQueue(sessionId);
	console.log("Viewer has left current = Viewer Count: " + viewerCount);
}

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

function sendMessageToRestartViewers(){
	
	console.log("Sending Request to restart clients! Number of clients: " + clientsList.length);
			
			for(var i=0; i<clientsList.length; i++){
				if(typeof presenter != "undefined" && presenter!=null){
					if(i!=presenter.id&&clientsList[i]!="undefined"&&clientsList[i]!=null){	
						console.log("Sending message request to client ID: " + i + ' Websocket State: ' + clientsList[i].readyState);
						clientsList[i].send(JSON.stringify({
							id : 'controlRestartingViewer'
						}));
					}
				}else{
					if(clientsList[i]!="undefined"&&clientsList[i]!=null){
						
						clientsList[i].send(JSON.stringify({
							id : 'controlRestartingViewer'
						}));
					}
				}
			}	
}

chWs.onopen = function(){
	channelState(presenterState);
}

chWs.onmessage = function(message){
	var parsedMessage = JSON.parse(message.data);
	console.log('Received message from channel server: ' + message.data);
	
	switch(message.id){
		case 'getChannelState':
	
			channelState(presenterState);
			break;
		default:
			console.log('Unrecognized message ' + message.data);
			break;		
	}
	
}
function channelState(state){
	
	var message={
		id : state,
		from : 'broadcastServer'
	};
	
	messageChannelServer(message);
	
}

function messageChannelServer(message){
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message to channel server: ' + jsonMessage + 'websocket state: '+ chWs.readyState);
	chWs.send(jsonMessage);
	
}

app.use(express.static(path.join(__dirname, 'static')));

//File uploading 

app.post('/',function(req, res){
	console.dir(req.file + ' ' + req.files);
	
	var busboy=new Busboy({headers:req.headers});

	busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      console.log('File [' + fieldname + ']: filename: ' + filename + ', encoding: ' + encoding + ', mimetype: ' + mimetype);
        
        //saving file to local directory
        var saveTo = path.join(fileDir,path.basename(filename));
        file.pipe(fs.createWriteStream(saveTo));

      file.on('data', function(data) {
        console.log('File [' + fieldname + '] got ' + data.length + ' bytes');
         });
      file.on('end', function() {
        console.log('File [' + fieldname + '] Finished');
      });
    });
    busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
      console.log('Field [' + fieldname + ']: value: ' + inspect(val));
    });
    busboy.on('finish', function() {
	   console.log('Done parsing form!');
	   //Refresh file list
	 var tmpfileList=fs.readdirSync(fileDir);
	 

	fileList=tmpfileList;
	
      res.writeHead(303, { Connection: 'close', Location: '/' });
      res.end();
    });
    req.pipe(busboy);	
});

app.get('/index.html',function(req,res){
	
	console.log('express api called get index.js means presenter page is accessed');
	
});
/*
var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, './uploads');
  },
  filename: function (req, file, callback) {
    callback(null, file.fieldname + '-' + Date.now());
  }
});
*/
//var upload = multer({ storage : storage});
//app.use(multer({dest:'./uploads/'}).single('singleFile'));
//var upload = multer({ dest: './uploads/' });

/*app.post('/',upload.single('singleFile'),function(req,res){
  console.log('Received Post: '+req.file);
  });*/
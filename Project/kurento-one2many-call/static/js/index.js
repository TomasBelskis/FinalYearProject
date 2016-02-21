
var ws = new WebSocket('wss://' + location.host + '/one2many');
var video;
var screen;
var webRtcPeerCam;
var webRtcPeerScreen;
// variables for getScreenConstraint fnc()
var chromeMediaSource = 'screen';
//var sourceId;
var extensionInstalled = false;
var pSdpOfferCam=null;
var pSdpOfferScreen=null;
var vSdpOfferCam=null;
var vSdpOfferScreen=null;


window.onload = function() {
	console = new Console();
	video = document.getElementById('video');
	screen = document.getElementById('screen');

	document.getElementById('call').addEventListener('click', function() { presenter(); } );
	document.getElementById('viewer').addEventListener('click', function() { viewer(); } );
	document.getElementById('terminate').addEventListener('click', function() { stop(); } );
	document.getElementById('screenstart').addEventListener('click', function() { startScreenStreamFrom(); } );
	//document.getElementById('screenstart').addEventListener('click'), function(){ screenShare(); } );
	//document.getElementById('screenstop').addEventListener('click'), function() { stopScreenShare(); } );
}
// content-script will send a 'SS_PING' msg if extension is installed
window.addEventListener('message', function(event) {
  if (event.origin !== window.location.origin) {
    return;
  }

  // content-script will send a 'SS_PING' msg if extension is installed
  if (event.data.type && (event.data.type === 'SS_PING')) {
    extensionInstalled = true;
  }

  // user chose a stream
  if (event.data.type && (event.data.type === 'SS_DIALOG_SUCCESS')) {
    startScreenStreamFrom(event.data.streamId);
    sourceId = event.data.streamId;
    window.idSource=event.data.streamId;
    console.log('StreamID: 1 value'+event.data.streamId);
     console.log('StreamID:2 value'+event.data.streamId);
  }

  // user clicked on 'cancel' in choose media dialog
  if (event.data.type && (event.data.type === 'SS_DIALOG_CANCEL')) {
    console.log('User cancelled!');
  }
});
/*
window.getScreenConstraints('screen', function (error, constraints_) {
                if (error)
                    return callback(error);
                constraints = [mediaConstraints];
                constraints.unshift(constraints_);
                getMedia(recursive.apply(undefined, constraints));
            }, guid);
*/
var isFirefox = typeof window.InstallTrigger !== 'undefined';
var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isChrome = !!window.chrome && !isOpera;

 
// getScreenConstraint Function
/*function getScreenConstraints(callback) {
    var firefoxScreenConstraints = {
        mozMediaSource: 'window',
        mediaSource: 'window'
    };
    
    if(isFirefox) return callback(null, firefoxScreenConstraints);

    // this statement defines getUserMedia constraints
    // that will be used to capture content of screen
    var screen_constraints = {
        mandatory: {
            chromeMediaSource: chromeMediaSource,
            maxWidth: screen.width > 1920 ? screen.width : 1920,
            maxHeight: screen.height > 1080 ? screen.height : 1080
        },
        optional: []
    };

    // this statement verifies chrome extension availability
    // if installed and available then it will invoke extension API
    // otherwise it will fallback to command-line based screen capturing API
    if (chromeMediaSource == 'desktop' && !sourceId) {
        getSourceId(function() {
            screen_constraints.mandatory.chromeMediaSourceId = sourceId;
            callback(sourceId == 'PermissionDeniedError' ? sourceId : null, screen_constraints);
        });
        return;
    }

    // this statement sets gets 'sourceId" and sets "chromeMediaSourceId" 
    if (chromeMediaSource == 'desktop') {
        screen_constraints.mandatory.chromeMediaSourceId = sourceId;
    }

    // now invoking native getUserMedia API
   // callback(null, screen_constraints);
}*/
/*
function getScreenConstraints(sourceId) {
        var screen_constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: chromeMediaSource,
                    maxWidth: window.screen.width > 1920 ? window.screen.width : 1920,
                    maxHeight: window.screen.height > 1080 ? window.screen.height : 1080
                },
                optional: []
            }
        };

        if (sourceId) {
            screen_constraints.video.mandatory.chromeMediaSourceId = sourceId;
        }
  return screen_constraints;
}*/


window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'presenterResponse':
		presenterResponse(parsedMessage);
		break;
	case 'viewerResponse':
		viewerResponse(parsedMessage);
		break;
	case 'stopCommunication':
		dispose();
		break;
	case 'iceCandidateCam':
		webRtcPeerCam.addIceCandidate(parsedMessage.candidate);
		break;
	case 'iceCandidateScreen':
		webRtcPeerScreen.addIceCandidate(parsedMessage.candidate);
		break;
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}

function presenterResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else{
		console.log("Presenter sdpAnswer Cam: "+ message.pSdpAnswerCam);
		webRtcPeerCam.processAnswer(message.pSdpAnswerCam);
		console.log("Presenter sdpAnswer Screen: "+ message.pSdpAnswerScreen);
		webRtcPeerScreen.processAnswer(message.pSdpAnswerScreen);
	}
}

function viewerResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else {
		console.log("Viewer sdpAnswer Cam: "+ message.vSdpAnswerCam);
		webRtcPeerCam.processAnswer(message.vSdpAnswerCam);
		console.log("Viewerd sdpAnswer Screen: "+ message.vSdpAnswerScreen);
		webRtcPeerScreen.processAnswer(message.vSdpAnswerScreen);
	}
}

function presenter() {
	
	if (!webRtcPeerCam&!webRtcPeerScreen) {
		showSpinner(video);

		var options1 = {
			localVideo: video,
			onicecandidate : onIceCandidateCam
	    }
		
		//Screen Share initiation
		getSourceId(function(sourceId){
		
		var screen_constraints = {
			audio:false,
			video:{
				mandatory:{
					chromeMediaSource: 'desktop',// error ? 'screen' : 'desktop',
					maxWidth: 1920,
					maxHeight: 1080,
					chromeMediaSourceId: sourceId
				},
				optional:[]
			}
		}
			
		console.log("xxxx-sourceID:"+ JSON.stringify(sourceId, null, 4));
		console.log("xxxx-constraints:"+ JSON.stringify(screen_constraints, null, 4));
			
			
	var options2 = {
				   localVideo : screen,
				   onicecandidate : onIceCandidateScreen,
				   mediaConstraints : screen_constraints,
				   sendSource : 'screen'
			 	};
			 	
			 	webRtcPeerCam = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options1, function(error) {
					if(error) return onError(error);
					this.generateOffer(onOfferPresenterCam);
				
				});
				
			 	webRtcPeerScreen = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options2, function(error) {
					if(error) return onError(error);
					this.generateOffer(onOfferPresenterScreen);	
				});
		});		
		
	}
}



function viewer() {
	if (!webRtcPeerCam) {
		showSpinner(video);
		showSpinner(screen);

		var options1 = {
			remoteVideo: video,
			onicecandidate : onIceCandidateCam
		}
	
		var options2 = {
			remoteVideo: screen,
			onicecandidate : onIceCandidateScreen
		}
		
		webRtcPeerCam = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options1, function(error) {
			if(error) return onError(error);
			
			this.generateOffer(onOfferViewerCam);
		});
		
		webRtcPeerScreen = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options2, function(error) {
			if(error) return onError(error);

			this.generateOffer(onOfferViewerScreen);
		});	
	}
}

//streamId for streaming
function startScreenStreamFrom() {

   getSourceId(function(sourceId){
		
		var screen_constraints = {
			audio:false,
			video:{
				mandatory:{
					chromeMediaSource: 'screen',// error ? 'screen' : 'desktop',
					maxWidth: 1920,
					maxHeight: 1080,
					chromeMediaSourceId: sourceId
				},
				optional:[]
			}
		}
			
			console.log("xxxx-sourceID:"+ JSON.stringify(sourceId, null, 4));
			console.log("xxxx-constraints:"+ JSON.stringify(screen_constraints, null, 4));
			
			
		var options = {
				   localVideo : screen,
				   onicecandidate : onIceCandidateScreen,
				   mediaConstraints : screen_constraints,
				   sendSource : 'screen'
			 	};
			
				webRtcPeerCam = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
					if(error) return onError(error);
		
					this.generateOffer(onOfferPresenterCam);
				});
			
			});

			var constraints = window.getScreenShare;
			console.log("Constrains to be passed:"+ JSON.stringify(constraints, null, 4));
			console.log("Constrains Extension installed:"+ JSON.stringify(extensionInstalled, null, 4));
}


function onOfferPresenterCam(error, offerSdp) {
    if (error) return onError(error);
    
	console.log("Presenter offer Cam: " + offerSdp);
	pSdpOfferCam=offerSdp;		
	
	sendPresenterOffer(pSdpOfferCam, pSdpOfferScreen);

}

function onOfferPresenterScreen(error, offerSdp) {
    if (error) return onError(error);
    
	console.log("Presenter offer Screen: " + offerSdp);
	pSdpOfferScreen=offerSdp;
		
		
}

function sendPresenterOffer(cam, screen){
	
		var message = {
			id : 'presenter',
			pSdpOfferCam : cam,
			pSdpOfferScreen : screen
			
		};	
		sendMessage(message);
}

function onOfferViewerCam(error, offerSdp) {
	if (error) return onError(error)

	console.log("Viewer offer Cam: " + offerSdp);
	vSdpOfferCam=offerSdp;
	
	
}

function onOfferViewerScreen(error, offerSdp) {
	if (error) return onError(error)

	console.log("Viewer offer Screen: " + offerSdp);
	vSdpOfferScreen=offerSdp;
	sendViewerOffer(vSdpOfferCam, vSdpOfferScreen);
	
}

function sendViewerOffer(cam, screen){
	
	var message = {
		id : 'viewer',
		vSdpOfferCam : cam,
		vSdpOfferScreen : screen
	}
	sendMessage(message);
	
}

function onIceCandidateCam(candidate) {
	   console.log('Local camera candidate' + JSON.stringify(candidate));

	   var message = {
	      id : 'onIceCandidateCam',
	      candidate : candidate
	   }
	   sendMessage(message);
}

function onIceCandidateScreen(candidate){
	console.log('Local screen candidate' + JSON.stringify(candidate));
	
	var message = { 
		id : 'onIceCandidateScreen',
		candidate : candidate
	}	
	sendMessage(message);
}

function stop() {
	if (webRtcPeerCam) {
		var message = {
				id : 'stop'
		}
		sendMessage(message);
		dispose();
	}
}

function dispose() {
	if (webRtcPeerCam) {
		webRtcPeerCam.dispose();
		webRtcPeerCam = null;
		
		webRtcPeerScreen.dispose();
		webRtcPeerScreen=null; 
	}
	hideSpinner(video);
	hideSpinner(screen);
	
}
function disposeScreenShare() {
	if (webRtcPeerCam) {
		webRtcPeerCam.dispose();
		webRtcPeerCam = null;
	}
	hideSpinner(screen);
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});

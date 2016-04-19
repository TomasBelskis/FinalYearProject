
var ws = new WebSocket('wss://' + location.host + '/broadcasting');

var video;
var screen;
var webRtcPeerCam;
var webRtcPeerScreen;

var screenSelected=false;

// variables for getScreenConstraint fnc()
var chromeMediaSource = 'screen';
//var sourceId;
var extensionInstalled = false;

var pSdpOfferCam=null;
var pSdpOfferScreen=null;

var vSdpOfferCam=null;
var vSdpOfferScreen=null;

var presentCam=false;
var presentScreen=false;

var viewCam=false;
var viewScreen=false;

var control=false;

var videoStreamType;

var filesDir = "./uploads/";

window.onload = function() {
	//console = new Console();
	video = document.getElementById('video');
	screen = document.getElementById('screen');

	document.getElementById('present').addEventListener('click', function() { 
		
			presentCam=true; 
			presentScreen=true;
			control=false;
			//document.getElementById('livestreamNotification').innerHTML="Live";
			//document.getElementById('livestreamNotification').style.color="lightgreen";	
			
			presenter(presentCam, presentScreen, function(){}); 	
	});
		
	document.getElementById('cameraStart').addEventListener('click', function(){
		
		presentCam=true;
		presentScreen=false;
		control=false;
		
		presenter(presentCam, presentScreen, function(){});
		
	});
	
	document.getElementById('screenStart').addEventListener('click', function(){
		presentCam=false;
		presentScreen=true;
		control=false;
		
		presenter(presentCam, presentScreen, function(){});
	});
	//document.getElementById('observe').addEventListener('click', function(){ startObserver(); });
	//document.getElementById('resetViewers').addEventListener('click', function(){ resetViewers();});
	document.getElementById('viewer').addEventListener('click', function() { startViewer(); });
	document.getElementById('terminate').addEventListener('click', function() { stop(); } );
	
	
	document.getElementById('send').addEventListener('click', function(){
		var val = document.getElementById('c_message').value;
		sendChat(val);
		document.getElementById('c_message').value="";
	});
	document.getElementById('submitButton').addEventListener('click', function(){ refreshFileList();});
}

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

var isFirefox = typeof window.InstallTrigger !== 'undefined';
var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isChrome = !!window.chrome && !isOpera;



window.onbeforeunload = function() {
	ws.close();
}

ws.onopen = function(){
	
	var message = {
		id:'presntableClientConnect'
	};
	
	sendMessage(message);
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'presenterResponse':
		//alert('Response Received');
		presenterResponse(parsedMessage);
		break;
		
	case 'viewerResponse':
		viewerResponse(parsedMessage);
		break;
		
	case 'chatResponse':
		displayChat(parsedMessage.chatMessage);
		break;
		
	case 'fileList':
		displayFilesList(parsedMessage.files);
		break;
		
	case 'viewerJoined':
		changeViewerCount(parsedMessage.vCount);
		break;
		
	case 'viewerLeft':
		changeViewerCount(parsedMessage.vCount);
		break;
		
	case 'typeResponse':
		videoStreamType = parsedMessage.streamType;
		if(videoStreamType=='camAndScreen'){//starts viewer with cam and screen
				viewCam=true;
				viewScreen=true;
				viewer(viewCam, viewScreen);
				break;
		}
		else if(videoStreamType=='cam'){//starts viewer with cam 
			viewCam=true;
			viewScreen=false;
			viewer(viewCam, viewScreen);
			break;
		}
		else{ //starts viewer with screen 
			viewCam=false;
			viewScreen=true;
			viewer(viewCam, viewScreen);
			break; 
		}
		break;
			
	case 'observerStartPresenterClient':
		if(parsedMessage.streamType=="cam&screen")
		{
			presenter(true, true, function(){
			});
			control=true;
			
		}else if(parsedMessage.streamType=="cam"){
		
			presenter(true, false, function(){});
			control=true;
		
		}else if(parsedMessage.streamType=="screen"){
			
			presenter(false, true, function(){});
			control=true;
		
		}
		break;
		
	case 'controlClosePresenter':
		stop(function(error){
			if(error) return onError(error);
			
			var message={
				id: 'controlClosedPresenter',
				streamType : parsedMessage.streamType,
				presenterID : parsedMessage.presenterID,
				newPresenterID : parsedMessage.newPresenterID
			};
			
			sendMessage(message);
		});
		break;
	
	case 'controlRestartingViewer':
		//alert('Restarting Viewer!');
		startViewer();
		break;
		
	case 'renderPdfUploadToClients':
		renderPdfUploadToClients(parsedMessage.dir, parsedMessage.fileName);
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
		
		//alert('Presenter response before element change');
		
		document.getElementById('livestreamNotification').innerHTML="Live";
		document.getElementById('livestreamNotification').style.color="lightgreen";	
		
		if(message.pSdpAnswerCam!=null&&message.pSdpAnswerScreen!=null){
			
			console.log("Presenter sdpAnswer Cam: "+ message.pSdpAnswerCam);
			webRtcPeerCam.processAnswer(message.pSdpAnswerCam);
			console.log("Presenter sdpAnswer Screen: "+ message.pSdpAnswerScreen);
			webRtcPeerScreen.processAnswer(message.pSdpAnswerScreen);
			
		}else if(message.pSdpAnswerCam!=null&&message.pSdpAnswerScreen==null){
			
			console.log("Presenter sdpAnswer Cam: "+ message.pSdpAnswerCam);
			webRtcPeerCam.processAnswer(message.pSdpAnswerCam);
	
		}else if(message.pSdpAnswerCam==null&&message.pSdpAnswerScreen!=null){
			
			console.log("Presenter sdpAnswer Screen: "+ message.pSdpAnswerScreen);
			webRtcPeerScreen.processAnswer(message.pSdpAnswerScreen);
			
		}
		
		// check if control initating a presenter
		if(control){
			var message={
					id : 'restartViewers'
				};
				
			sendMessage(message);
		}
		
		//send notifcation to server that presenter is live
		var message2={
			id : 'presenterIsLive'
		};
		
		sendMessage(message2);
		
	}
}

function viewerResponse(message) {
	if (message.response != 'accepted') {
		var errorMsg = message.message ? message.message : 'Unknow error';
		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else {
		
		if(message.vSdpAnswerCam!=null&&message.vSdpAnswerScreen!=null){
			
			console.log("Viewer sdpAnswer Cam: "+ message.vSdpAnswerCam);
			webRtcPeerCam.processAnswer(message.vSdpAnswerCam);
			console.log("Viewerd sdpAnswer Screen: "+ message.vSdpAnswerScreen);
			webRtcPeerScreen.processAnswer(message.vSdpAnswerScreen);
		
		}else if(message.vSdpAnswerCam!=null&&message.vSdpAnswerScreen==null){
			
			console.log("Viewer sdpAnswer Cam: "+ message.vSdpAnswerCam);
			webRtcPeerCam.processAnswer(message.vSdpAnswerCam);
			
		}else if(message.vSdpAnswerCam==null&&message.vSdpAnswerScreen!=null){
			
			console.log("Viewerd sdpAnswer Screen: "+ message.vSdpAnswerScreen);
			webRtcPeerScreen.processAnswer(message.vSdpAnswerScreen);
			
		}
		
	}
}

function presenter(cam, screen, callback) {
	
	if (!webRtcPeerCam&!webRtcPeerScreen) {
		
		if(cam&&screen){
			
		//showSpinner(video);
		//showSpinner(screen);	
		
		startBroadcast('camAndScreen');
		
		}else if(cam&&!screen){
			
			//showSpinner(video);
				
			startBroadcast('cam');
			
		}else if (!cam&&screen){
			
			//showSpinner(screen);
			
			startBroadcast('screen');
		}
		//callback required to restart viewers after control starting the presenter
		callback();
	}	
}

function startBroadcast(type){

	
	var options1 = {
				localVideo: video,
				onicecandidate : onIceCandidateCam,
		    };

	if(type=='cam'){
		
		//alert('cam');
			
		webRtcPeerCam = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options1, function(error) {
			if(error) return onError(error);
			this.generateOffer(onOfferPresenterCam);	
		});
		
	}else if(type=='screen'){
		
		//alert('screen');
			
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
			 	
			 	webRtcPeerScreen = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options2, function(error) {
					if(error) return onError(error);
					this.generateOffer(onOfferPresenterScreen);	
				});
		});	
		
	}else if(type=='camAndScreen'){
			//alert('camAndScreen');   
	showSpinner(video);
	showSpinner(screen);   		    		
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


function cameraStream(){
	
	var options1 = {
				localVideo: video,
				onicecandidate : onIceCandidateCam
		    }
		    
	webRtcPeerCam = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options1, function(error) {
					if(error) return onError(error);
					this.generateOffer(onOfferPresenterCam);
				
				});	
}

function screenStream(){
	
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
			 	
			 	webRtcPeerScreen = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options2, function(error) {
					if(error) return onError(error);
					this.generateOffer(onOfferPresenterScreen);	
				});
				screenSelected=true;
		});	
}
function startViewer(){
	ws.send(JSON.stringify({
		id : 'streamTypeRequest'
		}));
}

function viewer(cam, screen) {
	if (!webRtcPeerCam) {
		//showSpinner(video);
		//showSpinner(screen);
		
		if(cam&&screen){
			
			viewBroadcast('camAndScreen');
			
		}else if(cam&&!screen){
			
			viewBroadcast('cam');
			
		}else{
			
			viewBroadcast('screen');
		}
	}
}


function viewBroadcast(type){
	
	var options1 = {
			remoteVideo: video,
			onicecandidate : onIceCandidateCam
		}
	
	var options2 = {
			remoteVideo: screen,
			onicecandidate : onIceCandidateScreen
		}
		
	if(type=='camAndScreen'){
		//alert('view cam&screen');
		webRtcPeerCam = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options1, function(error) {
				if(error) return onError(error);
				
				this.generateOffer(onOfferViewerCam);
			});
			
		webRtcPeerScreen = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options2, function(error) {
			if(error) return onError(error);

			this.generateOffer(onOfferViewerScreen);
		});	
		
	}else if(type=='cam'){
		//alert('view cam');
		webRtcPeerCam = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options1, function(error) {
				if(error) return onError(error);
				
				this.generateOffer(onOfferViewerCam);
			});
	}else{
		//alert('view screen');
		webRtcPeerScreen = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options2, function(error) {
			if(error) return onError(error);

			this.generateOffer(onOfferViewerScreen);
		});	
	}
}

function renderPdfUploadToClients(dir, fileName){
	//alert("Received Pdf Information to render: direcetory"+ dir + "filename: " + fileName);
	var fullPath = dir;
	
	document.getElementById('renderer').style.visibility = null;
	var pdfContainer = document.getElementById('renderContainer');
	var pdfObject= document.getElementById('renderer');
		pdfObject.setAttribute('data', fullPath);
	pdfContainer.innerHTML=pdfContainer.innerHTML;
	//document.getElementById('renderContainer').style.display = '';
	//document.getElementById('renderer').style.visibility = "visible";	
}
/*
function startObserver(){
	var message={
		id : 'observer'
	};
	
	sendMessage(message);
}*/

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
	if(!presentCam&&presentScreen){
		sendPresenterOffer(null, offerSdp);
	}
	
}

function sendPresenterOffer(cam, screen){
	
		var message = {
			id : 'presenter',
			pSdpOfferCam : cam,
			pSdpOfferScreen : screen,
			control: control
			
		};	
		sendMessage(message);
}

function onOfferViewerCam(error, offerSdp) {
	if (error) return onError(error)

	console.log("Viewer offer Cam: " + offerSdp);
	vSdpOfferCam=offerSdp;
	if(viewCam&&!viewScreen){
		sendViewerOffer(offerSdp, null);
	}	
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

function sendChat(msg){
	
	var message={
		id :'chat',
		chatMessage : msg
	}
	sendMessage(message);
}

function displayChat(msg){
	document.getElementById('chatBox').innerHTML += '<br>' + msg;
}
/*
function observeClients(clients){
	
	var btnName1 = 'Initiate Cam and Screen';
	var btnId1 = 'Cam&Screen';
	
	var btnName2 = 'Initiate Cam';
	var btnId2 = 'Cam';
	
	var btnName3 = 'Initiate Screen';
	var btnId3  = 'Screen';
	
	//Functionality to stream both webcam and screenshare by the control
	for(c in clients){
		document.getElementById('client_list').innerHTML +='<br>' + 'SessionID: '  + c + ' Client Info: ' + clients[c] + '<a id="observerStartPresenterCS'+ c +'" href="#" data-cSessionId="' + c + '" class="btn btn-success"><span class="glyphicon glyphicon-play"></span>Cam and Screen</a><a id="observerStartPresenterC'+ c +'" href="#" data-cSessionId="' + c + '" class="btn btn-success"><span class="glyphicon glyphicon-play"></span>Cam</a><a id="observerStartPresenterS'+ c +'" href="#" data-cSessionId="' + c + '" class="btn btn-success"><span class="glyphicon glyphicon-play"></span>Screen</a>'; 
	}
	
	for(var i =0; i<clients.length;i++){
		(function(i){
			var client = "observerStartPresenterCS" + i;
			var client2 = "observerStartPresenterC" + i;
			var client3 = "observerStartPresenterS" + i;
			
			var clientSessionId = document.getElementById(client).getAttribute('data-cSessionId');
			
			document.getElementById(client).addEventListener('click', function(){ observerStartsPresenter(clientSessionId, 'cam&screen');});
			
			document.getElementById(client2).addEventListener('click', function(){ observerStartsPresenter(clientSessionId, 'cam');});
			
			document.getElementById(client3).addEventListener('click', function(){ observerStartsPresenter(clientSessionId, 'screen');});
	//document.getElementById('terminate').addEventListener('click', function() { stop(); } );
		})(i);
	}
	

}*/

function generateButtonsForControl(clients, btnName, btnId){
	//Functionality to stream screanshare only by control
		for(c in clients){
			document.getElementById('client_list').innerHTML +='<br>' + 'SessionID: '  + c + ' Client Info: ' + clients[c] + '<a id="observerStartPresenter'+ btnId + c +'" href="#" data-cSessionId="' + c + '" class="btn btn-success"><span class="glyphicon glyphicon-play"></span>'+ btnName +'</a>'; 
		}
		
		for(var i =0; i<clients.length;i++){
			(function(i){
				var client = "observerStartPresenter" + btnId + i;
				var clientSessionId = document.getElementById(client).getAttribute('data-cSessionId');
				document.getElementById(client).addEventListener('click', function(){ observerStartsPresenter(clientSessionId, btnId);});
		//document.getElementById('terminate').addEventListener('click', function() { stop(); } );
			})(i);
		}
}

/*
function observerStartsPresenter(clientSessionId, type){ // Observer starts the presenter client
	
	var message={
		id : 'observerCalledPresenter',
		streamType : type,
		newPresenterID : clientSessionId
	};
	sendMessage(message);
	
}
*/
/*
function refreshFileList(){//sends a message to server to refresh file list for all clients
	var message={
		id:'fileListRequest'
	};
	sendMessage(message);
}
*/

function displayFilesList(files){//This function using html dom elements dynaically displays the list of uploaded files
	
	var fileContainerElement = document.getElementById('fileContainer');
	fileContainerElement.innerHTML="";
		
	for(f in files){
		fileContainerElement.innerHTML += '<br><a href="'+filesDir+files[f]+'">' + 'File: '  + f + ' Name: ' + files[f] + '<a  id="renderPdfUpload'+f+'" href="#" data-pdf-filename="'+ files[f] + '" class="btn btn-success renderButton"><span class="glyphicon glyphicon-play"></span>Render</a>';  
		var renderPfdElementID="renderPdfUpload"+f;
	
	}	
	
	for(var i=0; i<files.length; i++){
		(function(i){
			var elementId = "renderPdfUpload"+i;	
			var fileName = document.getElementById(elementId).getAttribute('data-pdf-filename');
			document.getElementById(elementId).addEventListener('click', function(){
				
				//alert('file name: '+fileName +"element: " + elementId);
			
				renderPdfFromUpload(filesDir,fileName);});
					
		})(i);
	}
}

function changeViewerCount(vCount){ //changes the viewer info
	document.getElementById('views').innerHTML = vCount;
}

function onIceCandidateCam(candidate) { // sends local iceCandidate to server for cam media
	   console.log('Local camera candidate' + JSON.stringify(candidate));

	   var message = {
	      id : 'onIceCandidateCam',
	      candidate : candidate
	   }
	   sendMessage(message);
}

function onIceCandidateScreen(candidate){// sends local iceCandidate to server for screen media
	console.log('Local screen candidate' + JSON.stringify(candidate));
	
	var message = { 
		id : 'onIceCandidateScreen',
		candidate : candidate
	}	
	sendMessage(message);
}

function resetViewers(){ // sends a message to server to restart all clients to be viewers
	var message={
		id:'restartViewers'
	};
	
	sendMessage(message);
}

function stop() { // sends message a message that either client has been stoped
	if (webRtcPeerCam||webRtcPeerScreen) {
		var message = {
				id : 'stop'
		}
		sendMessage(message);
		
		document.getElementById('livestreamNotification').innerHTML="Not Live";
		document.getElementById('livestreamNotification').style.color="red";	
	
		dispose();
	}
}

function renderPdfFromUpload(dir,fileName){ //sends a message to server to renderPDf from uploads 
	//alert('renderPdf got called with parameters:' + dir + " 	"+fileName);
	var message={
		id : 'renderPdfUpload',
		dir : dir,
		fileName : fileName 
	}
	sendMessage(message);
}

//Function that deals with disposing of webrtcpeer connection
function dispose() {
	if (webRtcPeerCam&&webRtcPeerScreen) {// if both cam and screen peers are established then both peers are disposed
		webRtcPeerCam.dispose();
		webRtcPeerCam = null;
		
		webRtcPeerScreen.dispose();
		webRtcPeerScreen=null; 
		
		hideSpinner(video);
		hideSpinner(screen);
	}else if(webRtcPeerCam&&!webRtcPeerScreen){// if only cam peer is established then only cam peer is disposed
		webRtcPeerCam.dispose();
		webRtcPeerCam = null;
		
		hideSpinner(video);
	}
	else									// if none other peer is set that means only screen peer is set and dispose of screen peer
	{ 
		webRtcPeerScreen.dispose();
		webRtcPeerScreen=null; 
		
		hideSpinner(screen);
	}
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

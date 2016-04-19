var channelsURL = location.host;
var ws =  new WebSocket('ws://' + channelsURL);
var channelLive = 'images/tvOnline.png';
var channelOffline = 'images/tvOffline.png';

window.onload = function() {
	console.log('Location host for ws: ' + channelsURL);
};

//close websocket when page is being reloaded or closed
window.onbeforeunload = function() {
	ws.close();
};

function requestChannelState() {
        waitForSocketConnection(ws, function() {
            alert('ws established');
            getChannelState();
            
        });
    };


function waitForSocketConnection(socket, callback){
        setTimeout(
            function(){
                if (socket.readyState === 1) {
                    if(callback !== undefined){
                        callback();
                    }
                    return;
                } else {
                    waitForSocketConnection(socket,callback);
                }
            }, 5);
};

ws.onopen = function(){
                        console.log('connection established');
                        	getChannelState();           
						};

ws.onmessage = function(message) {

	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);
	
	
	switch(parsedMessage.id){
		
		case 'live':
		console.info('Channel is going live! ');
			changeChannelState(parsedMessage.id);
			break;
			
		case 'offline':
		console.info('Offline is going live! ');
			changeChannelState(parsedMessage.id);
			break;
			
		default:
			console.error('Unrecognized message: ' + message.data);
			break;
	}
};

function getChannelState(){
	var message = {
		id : 'channelStateRequest'
	};
	
	sendMessage(message);
}

function changeChannelState(state){
	var channel1 = 	document.getElementById('channel1');
	
	if(state=='live'){
	console.info('Loading live image! ');
	channel1.src = channelLive;
	
	}else{
	console.info('Loading offline image! ');
	channel1.src = channelOffline;
	
	}
	
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}

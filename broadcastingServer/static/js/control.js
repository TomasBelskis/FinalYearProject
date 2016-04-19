var ws = new WebSocket('wss://' + location.host + '/broadcasting');

window.onload = function() {

document.getElementById('observe').addEventListener('click', function(){ startObserver(); });
document.getElementById('resetViewers').addEventListener('click', function(){ resetViewers();});

}

ws.onopen = function(){
	var message = {
		id: 'controlClientJoined'
	};
	sendMessage(message);
}

window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);


	switch (parsedMessage.id) {
		case 'observerClientList':
			observeClients(parsedMessage.clientList);
			break;
		default:
				console.error('Unrecognized message', parsedMessage);
	}
}

function startObserver(){
	var message={
		id : 'observer'
	};
	
	sendMessage(message);
}

function observeClients(clients){
	
	var btnName1 = 'Initiate Cam and Screen';
	var btnId1 = 'Cam&Screen';
	
	var btnName2 = 'Initiate Cam';
	var btnId2 = 'Cam';
	
	var btnName3 = 'Initiate Screen';
	var btnId3  = 'Screen';
	
	//Functionality to stream both webcam and screenshare by the control
	for(c in clients){
		document.getElementById('client_list').innerHTML +='<br>' + 'SessionID: '  + c + ' Client Info: ' + clients[c] + '<a id="observerStartPresenterCS'+ c +'" href="#" data-cSessionId="' + clients[c] + '" class="btn btn-success"><span class="glyphicon glyphicon-play"></span>Cam and Screen</a><a id="observerStartPresenterC'+ c +'" href="#" data-cSessionId="' + clients[c] + '" class="btn btn-success"><span class="glyphicon glyphicon-play"></span>Cam</a><a id="observerStartPresenterS'+ c +'" href="#" data-cSessionId="' + clients[c] + '" class="btn btn-success"><span class="glyphicon glyphicon-play"></span>Screen</a>'; 
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
	

}

function observerStartsPresenter(clientSessionId, type){ // Observer starts the presenter client
	
	var message={
		id : 'observerCalledPresenter',
		streamType : type,
		newPresenterID : clientSessionId
	};
	sendMessage(message);
	
}

function resetViewers(){ // sends a message to server to restart all clients to be viewers
	var message={
		id:'restartViewers'
	};
	
	sendMessage(message);
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}

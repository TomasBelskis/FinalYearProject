

var path = require('path');
var http = require('http');
var url = require('url');
var ws = require('ws');
var express = require('express');
var port = 4080;

var app = express()

var server = http.createServer(app).listen(port, function () { console.log('Listening on ' + server.address() +':'+ server.address().port) });

var wss = new ws.Server({
	 server: server
	 });
	 
var channelState;
var clientList=[];
var idCounter = -1;
var broadcastingServerSessionID;
var sendMessage;
//creating unique session ids for new viewer clients
function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

wss.broadcast = function(data) {
  for (var i in this.clients)
    this.clients[i].send(data);
};

wss.on('connection', function connection(ws) {
  var sessionID=nextUniqueId();
 
  clientList[sessionID]=ws;
  
 //logging errors 
 ws.on('error', function(error) {
        console.log('Websocket error : Connection ' + sessionId + ' error');
        stop(sessionId);
 });
    
 //closing websocket
 ws.on('close', function() {
	    
	    var indexOfClient = clientList.indexOf(sessionID);
	    
	    clientList.splice(indexOfClient, 1);
	    
	    if(sessionID==broadcastingServerSessionID)
	    {
		    console.log('Websocket closing : Broadcaster server websocket connection ' + broadcastingServerSessionID + ' closed. ');
	   
	    }else{
		    
         console.log('Websocket closing : Connection ' + sessionID + ' closed. ');
         
        }
        
});


 ws.on('message', function incoming(_message) {

	var message = JSON.parse(_message);
  
	console.log('Received message from: ' + message.from + ' message contents: ' + JSON.stringify(message));

	      
            switch(message.from){
	        
	        case 'broadcastServer':
	        	broadcastingServerSessionID=sessionID;
	        	console.log("Broadcasting server succesfully connected to channel server, sessionId of broadcasting server" + broadcastingServerSessionID);
	        	break;
	        	
	        default:
	        	break;
        };        
        switch(message.id){
	      
	      case 'live':
	     	
	     	console.log('Setting channel to live');
	     	
	     	channelState = message.id; 
	     	
	     	wss.broadcast(JSON.stringify({
		     	id : 'live'
	     	}));
	     	
	     	break;
	      
	      case 'offline':
	      	
	      	console.log('Setting channel to offline');
	      	
	      	channelState = message.id;
	      		
		  	wss.broadcast(JSON.stringify({
		     	id : 'offline'
	     	}));
	    	
	      	break;
	      
	      case 'channelStateRequest':
	      
	     	 console.log('Sending channel state request to broadcasting server: ');
	     	 
	     		if(clientList[broadcastingServerSessionID]!="undefined"||clientList[broadcastingServerSessionID]!=null){
		     	 console.log('State of an existing  Websocket: ' + clientList[broadcastingServerSessionID].readyState);

		     	 if(clientList[broadcastingServerSessionID].readyState==1){
			  
			     	clientList[broadcastingServerSessionID].send(JSON.stringify({
				 	  	id : 'getChannelState'
			 	 	}));
		     	 }
	     	 }
	     	
	     	 break;
	      
	      default:
	       ws.send(JSON.stringify({
		       id : 'error',
			   message : 'invalid message: ' + message
		       }));
		     break;  
        };
  });

});

function channelControl(message){
	for(var i=0;i<clientList.length;i++){
		if(broadcastingServerSessionID!=i){
			clientList[i].send(message);
		}
	}
}

app.set('view engine', 'ejs');


app.use(express.static(path.join(__dirname, 'static')));

//server.on('request', app);
//server.listen(port, function () { console.log('Listening on ' + server.address().port) });


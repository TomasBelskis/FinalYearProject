


var ws = new WebSocket('wss://' + location.host + '/broadcasting');



window.onload = function() {
	
	document.getElementById('button').addEventListener('click', function(){
		//alert('hello');
		getVideoRecordings()
	});
	
	//alert(location.host);
}
// Function that is invokend the a websocket connection is established
ws.onopen = function(){
                        console.log('connection established');
                        var message={
	                        id:'clientRecordingsPage'
                        };
                        	sendMessage(message);
                        	
                        	getVideoRecordings();           
						};




//close ws on page close or reload
window.onbeforeunload = function() {
	ws.close();
}

//incoming messages from the server
ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);
	
	switch (parsedMessage.id) {
		
		case 'recList':
			displayVideosToPage(parsedMessage.recList);
			break;
		
		default:
		console.error('Unrecognized message', parsedMessage);
			
	}
}

//Sends message to get list of recordings
function getVideoRecordings(){
	//alert("Got called!");
	var message = {
		id: 'getAllRecordings',
		from : 'recordings'
	};
	
	sendMessage(message);
}

//generates videos on the webpage
function displayVideosToPage(recList){
	var videoContainer = document.getElementById('recordingsContainer');
	var recDir = './recordings/';
	videoContainer.innerHTML="";
	
	//Dyanmicaly generates video tag elemetes on recording.html page
	for(r in recList){
		videoContainer.innerHTML+='<div class="col-sm-3"><div  class="embed-responsive embed-responsive-16by9"><video width ="320" height="240" class="embed-responsive-item" controls><source src="' + recDir + recList[r] + '" type="video/webm"> Your browser does not support video tag! </video></div><a id="uploadRec'+r +'" href="#" data-rec-filename="'+ recList[r] + '" class="btn btn-success"><span class="glyphicon glyphicon-upload"></span>Upload</a><a id="deleteRec'+ r +'" href="upload.html" data-rec-filename="'+ recList[r] + '" class="btn btn-danger"><span class="glyphicon glyphicon-remove"></span>Delete</a><a id="downloadRec'+ r +'" href="'+ recDir + recList[r] + '" data-rec-filename="'+ recList[r] + '" class="btn btn-success" download><span class="glyphicon glyphicon-download"></span>Download</a></div>';
	}
	
	for(var i=0; i<recList.length; i++){
		(function(i){
			var elementId = "uploadRec" + i;
			var dElementId = "deleteRec"+i;	
			var fileName = document.getElementById(elementId).getAttribute('data-rec-filename');
			var dFileName  =  document.getElementById(dElementId).getAttribute('data-rec-filename');

			document.getElementById(elementId).addEventListener('click', function(){
				
					//alert('file name: '+fileName +"element: " + elementId);
					uploadRec(recDir,fileName);
				
				});
				
			document.getElementById(dElementId).addEventListener('click', function(){
				
					//alert('file name: '+fileName +"element: " + elementId);
					deleteRec(recDir,fileName);
				
				});

		})(i);
	}

}


function uploadRec(dir,file){
	console.info('Attempting to upload file! ');
	var message={
		id : 'uploadRec',
		file : file,
		dir : dir
	};
	
	sendMessage(message);
}

function deleteRec(dir,file){
	var confirmation = confirm('Do you really want to delete recording ' + file + '?');
	
	if(confirmation){
		
		var message = {
			id : 'deleteRecording',
			dir: dir,
			file : file
		};
		sendMessage(message);
	
	}else{
		
		console.info('File deletion canceled ');
		
	}
}
//Function to send messages to server
function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}
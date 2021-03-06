//
// HDX-specific Javascript functions
//
// Load and view data files related to Travel Mapping (TM), formerly
// Clinched Highway Mapping (CHM), related academic data sets.
//
// Primary author: Jim Teresco, Siena College, The College of Saint Rose
//
// Additional authors: Razie Fathi, Arjol Pengu, Maria Bamundo, Clarice Tarbay,
// Michael Dagostino, Abdul Samad, Eric Sauer

// some globals used here (map, waypoints, markers, etc) come from
// tmjsfuncs.js

// start UI redesign 2018-06-14


// variables declared here are HDX-specific global variables

// Essentially an enum of possible states of the simulation, used to
// ensure that only things that should be done are permitted in a
// given state.  Any AV_ state implies that a graph is loaded.  
var hdxStates = {

    NO_DATA: 1,
    GRAPH_LOADED: 2,
    WPT_LOADED: 3,
    NMP_LOADED: 4,
    WPL_LOADED: 5,
    PTH_LOADED: 6,
    AV_SELECTED: 7,
    AV_RUNNING: 8,
    AV_PAUSED: 9,
    AV_COMPLETE: 10
};

// group of variables used by many or all algorithm visualizations
var hdxAV = {
    // current state of HDX
    status: hdxStates.NO_DATA,

    // delay (in ms) between visualization steps
    // default delay 50 should match the selected option in the speedChanger
    // and delay should be used for the amount of time in the future to use
    // for setTimeout calls
    delay: 50,

    // list of available AVs
    avList: [],
    
    // remember the currently-selected AV
    currentAV: null,
    
    // are we tracing at the action level rather than the iteration level
    traceActions: true,

    // track the end of an iteration defined by a series of actions
    iterationDone: false,

    // next action to be executed, must refer to labels in the current
    // AV's avActions array, set to the first before initial call
    // to nextStep, and each algorithm must set to "DONE" to
    // terminate
    nextAction: "UNDEFINED",
    
    // for pseudocode highlighting, id of element to unhighlight
    previousHighlight: null,

    // for counting pseudocode executions
    execCounts: [],
    maxExecCount: 0,
    execCountsRecolor: false,
    
    // some commonly-used document elements
    algStat: null,
    algOptions: null,
    startPause: null,
    
    // set the status and do any needed cleanup for that change
    setStatus(newStatus) {
	
	if (this.status == newStatus) {
	    return;
	}

	this.status = newStatus;
	switch (newStatus) {
	case hdxStates.GRAPH_LOADED:
	case hdxStates.WPT_LOADED:
	case hdxStates.PTH_LOADED:
	case hdxStates.NMP_LOADED:
	case hdxStates.WPL_LOADED:
	    this.algStat.innerHTML = "";
	    this.algOptions.innerHTML = "";
	    break;

	case hdxStates.AV_COMPLETE:
	    this.startPause.disabled = true;
	    this.startPause.innerHTML = "Start";
	    break;
	default:
	    // other AV in progress states
	    this.startPause.disabled = false;
	    break;
	}
    },
    
    // are we paused?
    paused() {
	return this.status == hdxStates.AV_PAUSED;
    },

    // all setup that needs to happen on page load for HDX
    initOnLoad() {
	// populate the list of algorithms -- add new entries here
	this.avList.push(hdxNoAV);
	this.avList.push(hdxVertexExtremesSearchAV);
	this.avList.push(hdxEdgeExtremesSearchAV);
	this.avList.push(hdxExtremePairsAV);
	this.avList.push(hdxGraphTraversalsAV);
	this.avList.push(hdxDijkstraAV);
	this.avList.push(hdxPrimAV);
	this.avList.push(hdxBFConvexHullAV);
	
	// populate the algorithm selection select with options
	// from the avList
	let s = document.getElementById("AlgorithmSelection");
	s.innerHTML = "";
	for (var i = 0; i < this.avList.length; i++) {
	    let av = this.avList[i];
	    s.innerHTML += '<option value="' + av.value +
		'">' + av.name + '</option>';
	}

	// set up some references to commonly-used document elements

	// the algorithm status message bar on the algorithm
	// visualization information panel
	this.algStat = document.getElementById("algorithmStatus");

	
	this.algOptions = document.getElementById("algorithmOptions");
	this.startPause = document.getElementById("startPauseButton");

	// register the HDX-specific event handler for waypoint clicks
	registerMarkerClickListener(labelClickHDX);
    },

    // this will do an action, an iteration, or run to completion
    // for the AV passed in
    nextStep(thisAV) {

	// if the simulation is paused, we can do nothing, as this function
	// will be called again when we restart
	if (hdxAV.paused()) {
            return;
	}

	// run to completion option
	if (hdxAV.delay == 0) {
	    while (hdxAV.nextAction != "DONE") {
		hdxAV.oneIteration(thisAV);
	    }
	    return;
	}

	// if delay has become -1, it means we took a single step and
	// should pause now rather than perform more work
	if (hdxAV.delay == -1) {
	    hdxAV.setStatus(hdxStates.AV_PAUSED);
	}

	// we are supposed to do some work, either a single action or
	// a full iteration
	if (hdxAV.traceActions) {
	    hdxAV.oneAction(thisAV);
	}
	else {
	    //console.log("nextStep() calling oneIteration()");
	    hdxAV.oneIteration(thisAV);
	}

	// in either case, we now set the timeout for the next one
	if (hdxAV.nextAction != "DONE") {
	    //console.log("nextStep(): setting callback for " + hdxAV.delay);
            setTimeout(function() { hdxAV.nextStep(thisAV) }, hdxAV.delay);
	}
	else {
	    // if pseudocode is displayed, undisplay at the end to ensure
	    // better visibility for results
	    document.getElementById("pseudoCheckbox").checked = false;
	    document.getElementById("pseudoText").style.display = "none";
	    
	    hdxAV.setStatus(hdxStates.AV_COMPLETE);
	}
    },

    // one iteration is defined as a series of actions ending with
    // one which sets hdxAV.iterationDone to true
    oneIteration(thisAV) {

	//console.log("oneIteration()");
	hdxAV.iterationDone = false;
	while (!hdxAV.iterationDone) {
	    //console.log("oneIteration() calling oneAction(), nextAction=" + this.nextAction);
	    hdxAV.oneAction(thisAV);
	}
    },

    // do one action of thisAV's array of actions
    oneAction(thisAV) {

	// look up the action to execute next
	let currentAction = null;
	for (var i = 0; i < thisAV.avActions.length; i++) {
	    if (hdxAV.nextAction == thisAV.avActions[i].label) {
		currentAction = thisAV.avActions[i];
		break;
	    }
	}
	if (currentAction == null) {
	    alert("HDX Internal error: bad AV action: " + hdxAV.nextAction);
	    hdxAV.setStatus(hdxStates.AV_PAUSED);
	}

	// we have an action to execute

	// undo any previous highlighting
	unhighlightPseudocode();

	//console.log("ACTION: " + hdxAV.nextAction);
	
	// execute the JS to continue the AV
	currentAction.code(thisAV);

	// update status to this line of code's logMessage, after
	// code executes so any simulation variables updated through
	// this step can be reflected in the update
	hdxAV.algStat.innerHTML = currentAction.logMessage(thisAV);
	//console.log("ACTION DONE: " + currentAction.logMessage(thisAV));
    },

    // compute a color code to highlight based on code execution frequency
    // light blue is infrequent, pink is frequent
    execCountColor(count) {
	let rank = 75 * count/hdxAV.maxExecCount;
	let r = 180 + rank;
	let b = 255 - rank;
	return "rgb(" + r + ",210, " + b + ")";
    }
};


/**********************************************************************
 * General AV functions
 **********************************************************************/

// speedChanger dropdown callback
function speedChanged() {

    var speedChanger = document.getElementById("speedChanger");
    hdxAV.delay = speedChanger.options[speedChanger.selectedIndex].value;
}

// algorithm visualization color settings and other parameters
var visualSettings = {
    // first, some used by many algorithms
    reset: {
      color: "#ffffff",
        textColor: "black",
        scale: 2,
        name: "Vertices",
        value: 0,
        weight: 5,
        opacity: .6
    },
    undiscovered: {
        color: "#202020",
        textColor: "#e0e0e0",
        scale: 4,
	name: "undiscovered", 
	value: 0,
	weight: 5,
	opacity: 0.6
    },
    visiting: {
        color: "yellow",
        textColor: "black",
        scale: 8,
	name: "visiting",
	value: 0,
	weight: 8,
	opacity: 0.8
    },
    leader: {
        color: "darkBlue",
        textColor: "white",
        scale: 6,
	name: "leader",
	value: 0
    },
    leader2: {
        color: "DodgerBlue",
        textColor: "white",
        scale: 6,
	name: "leader",
	value: 0
    },
    searchFailed: {
        color: "red",
        textColor: "white",
        scale: 6,
	name: "searchFailed",
	value: 0
    },
    discarded: {
        color: "#a0a0a0",
        textColor: "black",
        scale: 3,
	name: "discarded",
	value: 0,
	weight: 5,
	opacity: 0.5
    },

    // these are in graph traversals and Dijkstra's so far
    discardedOnDiscovery: {
        color: "#f0a0a0",
        textColor: "black",
        scale: 4,
	name: "discardedOnDiscovery",
	value: 0,
	weight: 5,
	opacity: 0.6
    },
    startVertex: {
        color: "purple",
        textColor: "white",
        scale: 6,
	name: "startVertex",
	value: 0
    },
    endVertex: {
        color: "violet",
        textColor: "white",
        scale: 6,
	name: "endVertex",
	value: 0
    },

    // both vertex and edge search
    shortLabelLeader: {
        color: "#654321",
        textColor: "white",
        scale: 6,
	name: "shortLabelLeader",
	value: 0,
	weight: 8,
	opacity: 0.6
    },
    longLabelLeader: {
        color: "#006400",
        textColor: "white",
        scale: 6,
	name: "longLabelLeader",
	value: 0,
	weight: 8,
	opacity: 0.6
    },
    spanningTree: {
        color: "#0000a0",
        textColor: "white",
        scale: 4,
	name: "spanningTree",
	value: 0,
	weight: 4,
	opacity: 0.6
    },
    discovered: {
        color: "#00a000",
        textColor: "white",
        scale: 4,
	name: "discovered",
	value: 0
    },
    hoverV: {
	color: "#a0036b",
	textColor: "white",
	scale: 6,
	name: "hoverV",
	value: 0
    },
    pseudocodeDefault: {
	color: "white",
	textColor: "black"
    }
};

/* functions for algorithm visualization control panel */
var AVCPsuffix = "AVCPEntry";
var AVCPentries = [];

/* add entry to the algorithm visualization control panel */
function addEntryToAVControlPanel(namePrefix, vs) {
    
    let avControlTbody = document.getElementById('algorithmVars');
    let infoBox = document.createElement('td');
    let infoBoxtr= document.createElement('tr');
    infoBox.setAttribute('id', namePrefix + AVCPsuffix);
    infoBox.setAttribute('style', "color:" + vs.textColor +
			 "; background-color:" + vs.color);
    infoBoxtr.appendChild(infoBox);
    avControlTbody.appendChild(infoBoxtr);
    AVCPentries.push(namePrefix);
}

/* clean up all entries from algorithm visualization control panel */
function cleanupAVControlPanel() {

    document.getElementById("algorithmStatus").innerHTML = "";
    document.getElementById("pseudoText").innerHTML = "";
    while (AVCPentries.length > 0) {
	removeEntryFromAVControlPanel(AVCPentries.pop());
    }
}

/* remove entry from algorithm visualization control panel */
function removeEntryFromAVControlPanel(namePrefix) {

    let avControlTbody = document.getElementById('algorithmVars');
    let infoBox = document.getElementById(namePrefix + AVCPsuffix);
    if (infoBox != null) {
	let infoBoxtr= infoBox.parentNode;
	avControlTbody.removeChild(infoBoxtr);
    }
}

/* set the HTML of an AV control panel entry */
function updateAVControlEntry(namePrefix, text) {

    document.getElementById(namePrefix + AVCPsuffix).innerHTML = text;
}

/* set the visualSettings of an AV control panel entry */
function updateAVControlVisualSettings(namePrefix, vs) {

    let infoBox = document.getElementById(namePrefix + AVCPsuffix);
    infoBox.setAttribute('style', "color:" + vs.textColor +
			 "; background-color:" + vs.color);
}

/* get the document element of an AV control entry */
function getAVControlEntryDocumentElement(namePrefix) {

    return document.getElementById(namePrefix + AVCPsuffix);
}

/* Support for selection of a vertex (such as a starting or ending
   vertex for a traversal or search) by clicking on a waypoint on
   the map or an entry in the waypoint table.  The startSelection
   method should be set as the onfocus event handler for a selector
   used to store vertex numbers for any purpose in an algorithm.

   Based on code originally developed by Arjol Pengu, Summer 2017. 
*/
var hdxVertexSelector = {

    // the string to find the selector to fill in with
    // a vertex number, if null, no selection is in process
    selector: "",

    // function to call to start the selection (when the
    // selector is clicked)
    startSelection(label) {
	//alert("startSelection: " + label);
	this.selector = label;
    },

    // the actual event handler function to set the value
    select(vNum) {
	//alert("select: " + vNum);
	if (this.selector != "") {
	    let v = document.getElementById(this.selector);
	    v.value = vNum;
	    // and update the label
	    waypointSelectorChanged(this.selector);
	}
	this.selector = "";
    }
};

// a function to build HTML to insert a vertex/waypoint selector
// component
// id is the HTML element id for the input
// label is the label for the control
// initVal is the waypoint number to use for initialization
function buildWaypointSelector(id,label,initVal) {
	
    return label + ' <input id="' + id +
	'" onfocus="hdxVertexSelector.startSelection(\'' + id +
	'\')" type="number" value="' + initVal + '" min="0" max="' +
	(waypoints.length-1) + '" size="6" style="width: 7em" ' +
	'onchange="waypointSelectorChanged(\'' + id + '\')"' +
	'/><span id="' + id + 'Label">' + waypoints[initVal].label +
	'</span>';
	
}

// event handler for waypoint selectors
function waypointSelectorChanged(id) {

    let vNum = document.getElementById(id).value;
    //let vNum = document.querySelector(id).value;
    document.getElementById(id + "Label").innerHTML = waypoints[vNum].label;
	
}

// variables and functions to highlight waypoints and connections
// when the mouse hovers over them
// TODO: these can go into an object
var vcolor, vtext, vicon;
var ecolor, etext, edge, edgew;

function hoverV(i, bool) {
    if ((bool && hdxAV.paused()) || !bool) {
	vicon = markers[i].options.icon;
	vcolor = document.getElementById("waypoint"+i).style.backgroundColor;
	vtext = document.getElementById("waypoint"+i).style.color;
	updateMarkerAndTable(i, visualSettings.hoverV, 0, false);
    }
}

function hoverEndV(i, bool) {
    if ((bool && hdxAV.paused()) || !bool) {
	markers[i].setIcon(vicon);
	document.getElementById("waypoint"+i).style.backgroundColor = vcolor;
	document.getElementById("waypoint"+i).style.color = vtext;
	if ($("#l"+i).length > 0) {
	    document.getElementById("l"+i).style.backgroundColor = vcolor;
	}
	if ($("#di"+i).length > 0) {
	    document.getElementById("di"+i).style.backgroundColor = vcolor;
	    document.getElementById("di"+i).style.color = vtext;
	}
    }
}

function hoverE(event, i) {
    ecolor = event.target.parentNode.style.backgroundColor;
    etext = event.target.parentNode.style.color;
    event.target.parentNode.style.color = visualSettings.hoverV.textColor;
    event.target.parentNode.style.backgroundColor = visualSettings.hoverV.color
    edge = connections[i].options.color;
    edgew = connections[i].options.opacity;
    connections[i].setStyle({
        color: visualSettings.hoverV.color,
	opacity: 0.7
    });
}

function hoverEndE(event, i) {
    connections[i].setStyle({
        color: edge,
	opacity: edgew
    });
    event.target.parentNode.style.color = etext;
    event.target.parentNode.style.backgroundColor = ecolor;
}

// special HDX version of the label click event handler that is
// called by the general TM addMarker, as it is registered
// by the registerMarkerClickListener call in updateMap
function labelClickHDX(i) {

    // handle vertex control selection
    hdxVertexSelector.select(i);

    // standard map center/infowindow display
    map.panTo([waypoints[i].lat, waypoints[i].lon]);

    markers[i].openPopup();
}


function changeUnits(event) {
    prevUnit = curUnit;
    curUnit = event.target.value;
    if (event.target.value == "miles") {
	changeUnitsInner("feet", "km", "meters", .000189394, .621371, .000621371);
    }
    else if (event.target.value == "feet") {
	changeUnitsInner("miles", "km", "meters", 5280, 3280.84, 3.28084);
    }
    else if (event.target.value == "meters") {
	changeUnitsInner("feet", "km", "miles", .3048, 1000, 1609.34);	
    }
    else if (event.target.value == "km") {
	changeUnitsInner("feet", "meters", "miles", .0003048, .001, 1.60934);
    }
}

function changeUnitsInner(un1, un2, un3, mult1, mult2, mult3) {
    loopChangeUnits(un1, mult1);
    loopChangeUnits(un2, mult2);
    loopChangeUnits(un3, mult3);
}

function loopChangeUnits(oldUnit, mult) {
    var arr = document.getElementsByClassName(oldUnit);
    for (var i = arr.length-1; i >= 0; i--) {
	if (arr[i].innerHTML.indexOf(oldUnit) == -1)
	    arr[i].innerHTML =
	    Math.round(parseFloat(arr[i].innerHTML)*mult*1000)/1000;
	else
	    arr[i].innerHTML =
	    Math.round(parseFloat(arr[i].innerHTML.substring(0, (arr[i].innerHTML.length-1-oldUnit.length)))*mult*1000)/1000+" "+curUnit;
	arr[i].classList.add(curUnit);
	arr[i].classList.remove(oldUnit);		
    }	
}
var curUnit = "miles";
var prevUnit;

function generateUnit(lat1, lon1, lat2, lon2) {
    prevUnit = curUnit;
    curUnit = document.getElementById("distUnits").value;
    if (curUnit == "miles") {
	return Math.round(distanceInMiles(lat1, lon1, lat2, lon2)*1000)/1000 +
	    " miles";
    }
    else if (curUnit == "feet") {
	return Math.round(distanceInFeet(lat1, lon1, lat2, lon2)*1000)/1000 +
	    " feet";
    }
    else if (curUnit == "meters") {
	return Math.round(distanceInFeet(lat1, lon1, lat2, lon2)*.3048*1000)/1000
	    + " meters";
    }
    else if (curUnit == "km") {
	return Math.round(distanceInFeet(lat1, lon1, lat2, lon2)*.0003048*1000)/1000
	    + " km";
    }
}

function convertMiles(num) {
    if (curUnit == "feet") {
	return Math.round(num*5280*1000)/1000;
    }
    else if (curUnit == "meters") {
	return Math.round(num*1609.34*1000)/1000;
    }
    else if (curUnit == "km") {
	return Math.round(num*1.60934*1000)/1000;
    }
    else {
	return Math.round(num*1000)/1000;
    }
}

// function to set the waypoint color, scale, and table entry
// using an entry passed in from the visualSettings
// optionally hide also by setting display to none
function updateMarkerAndTable(waypointNum, vs, zIndex, hideTableLine) {

    if (!vs.hasOwnProperty('icon')) {
	var options = {
	    iconShape: 'circle-dot',
	    iconSize: [vs.scale, vs.scale],
	    iconAnchor: [vs.scale, vs.scale],
	    borderWidth: vs.scale,
	    borderColor: vs.color
	};

	vs.icon = L.BeautifyIcon.icon(options);
    }
    markers[waypointNum].setIcon(vs.icon);
    markers[waypointNum].setZIndexOffset(2000+zIndex);
    var row = document.getElementById("waypoint"+waypointNum);
    row.style.backgroundColor = vs.color;
    row.style.color = vs.textColor;
    if (hideTableLine) {
        row.style.display = "none";
    }
    else if(hideTableLine == false){
       row.style.display = "table-row";
   }

    // remaining code belongs elsewhere or is now obsolete...
    /*
    if ($("#l"+waypointNum).length > 0) {
	document.getElementById("l"+(waypointNum)).style.backgroundColor = vs.color;
    }
    if ($("#di"+waypointNum).length > 0) {
	document.getElementById("di"+waypointNum).style.backgroundColor = vs.color;
	document.getElementById("di"+waypointNum).style.color = vs.textColor;
    }
    if (vs.color == "#0000a0") {
	var clone = row.cloneNode(true);
	clone.className = "blueRow";
	row.parentNode.appendChild(clone);
	row.parentNode.removeChild(row);		
    }
    if (vs.color == "#00a000") {
	var clone = row.cloneNode(true);
	row.parentNode.insertBefore(clone, row.parentNode.childNodes[1]);
	row.parentNode.removeChild(row);		
    }
    */
}

// function to set the edge color and table entry information
// based on the visual settings, optionally hide line
function updatePolylineAndTable(edgeNum, vs, hideTableLine) {

    let edge = graphEdges[edgeNum];
    connections[edgeNum].setStyle({
	color: vs.color,
	weight: vs.weight,
	opacity: vs.opacity});

    let row = document.getElementById("connection" + edgeNum);
    row.style.backgroundColor = vs.color;
    row.style.color = vs.textColor;
    if (hideTableLine) {
	row.style.display = "none";
    } 
}

// function to show/hide/reinitialize waypoints and connections
// at the initialization of an AV
//
// showW: boolean indicating whether to show waypoints on map and in table
// showC: boolean indicating whether to show connections on map and in table
// vs: a visualSettings object to use to color shown components
function initWaypointsAndConnections(showW, showC, vs) {

    if (showW) {
	// make sure waypoints table is displayed
	document.getElementById("waypoints").style.display = "";
	
	// show all existing markers on map and table
	for (var i = 0; i < waypoints.length; i++) {
            markers[i].addTo(map);
            updateMarkerAndTable(i, vs, 0, false);
	}

	// ensure individual table rows are shown
	var pointRows = document.getElementById("waypoints").getElementsByTagName("*");
	for (var i = 0; i < pointRows.length; i++) {
	    pointRows[i].style.display = "";
	}
    }
    else {
	// undisplay the waypoints table
	document.getElementById("waypoints").style.display = "none";

	// remove all markers from the map
	for (var i = 0; i < waypoints.length; i++) {
            markers[i].remove();
	}
    }

    if (showC) {
	// display the connections table
	document.getElementById("connection").style.display = "";

	// ensure individual table rows are shown
	var pointRows = document.getElementById("connection").getElementsByTagName("*");
	for (var i = 0; i < pointRows.length; i++) {
	    pointRows[i].style.display = "";
	}

	// show edges
	for (var i = 0; i < connections.length; i++) {
	    updatePolylineAndTable(i, vs, false);
	}
    }
    else {
	// undisplay the connections table
	document.getElementById("connection").style.display = "none";

	// remove each connection from the map
	for (var i = 0; i < connections.length; i++) {
            connections[i].remove();
	}
    }
}

// update a chunk of pseudocode with an id based on given visualsettings
// now also managing execution counts
function highlightPseudocode(id, vs) {

    let codeChunk = document.getElementById(id);
    if (codeChunk != null) {
	codeChunk.style.backgroundColor = vs.color;
	codeChunk.style.color = vs.textColor;
	hdxAV.previousHighlight = id;

	// execution counting
	if (id in hdxAV.execCounts) {
	    hdxAV.execCounts[id]++;
	}
	else {
	    hdxAV.execCounts[id] = 1;
	}

	// if we have a new largest count, we'll recolor
	if (hdxAV.execCounts[id] > hdxAV.maxExecCount) {
	    hdxAV.maxExecCount = hdxAV.execCounts[id];
	    hdxAV.execCountRecolor = true;
	}
	codeChunk.title = "Exec count: " + hdxAV.execCounts[id];
    }
}

// unhighlight previously-highlighted pseudocode
function unhighlightPseudocode() {

    if (hdxAV.previousHighlight != null) {
	let codeChunk = document.getElementById(hdxAV.previousHighlight);
	if (codeChunk != null) {
	    codeChunk.style.backgroundColor =
		hdxAV.execCountColor(hdxAV.execCounts[hdxAV.previousHighlight]);
	    // above was: visualSettings.pseudocodeDefault.color;
	    codeChunk.style.color = visualSettings.pseudocodeDefault.textColor;
	    hdxAV.previousHighlight = null;
	}
    }
    // did we trigger a recolor?  if so, recolor all
    if (hdxAV.execCountRecolor) {
	hdxAV.execCountRecolor = false;
	for (let key in hdxAV.execCounts) {
	    let codeChunk = document.getElementById(key);
	    codeChunk.style.backgroundColor =
		hdxAV.execCountColor(hdxAV.execCounts[key]);
	}
    }
	
}

// function to help build the table of pseudocode for highlighting
// indent: number of indentation levels
// code: line or array of code lines to place in block
// id: DOM id to give the enclosing td element
function pcEntry(indent, code, id) {

    let entry;
    if (entry != "") {
	entry = '<tr><td id="' + id + '">';
    }
    else {
	entry = '<tr><td>';
    }
    if (Array.isArray(code)) {
	for (var i = 0; i < code.length; i++) {
	    for (var j = 0; j < indent; j++) {
		entry += "&nbsp;&nbsp;";
	    }
	    entry += code[i] + "<br />";
	}
    }
    else {
	for (var i = 0; i < indent; i++) {
	    entry += "&nbsp;&nbsp;";
	}
	entry += code;
    }
    entry += '</td></tr>';
    return entry;
}

// function to limit the given string to the given length, replacing
// characters in the middle with ".." if needed to shorten
function shortLabel(label, max) {
    
    if (label.length > max) {
	return label.substring(0,max/2-1) + ".." +
	    label.substring(label.length - (max/2-1));
    }
    return label;
}

// dummy AV entry for main menu
var hdxNoAV = {

    // entries for list of AVs
    value: "NONE",
    name: "No Algorithm Visualization",
    description: "No algorithm is selected, please select.",

    code: "Select and start an algorithm to view pseudocode.",
    
    // provide prepToStart, nextStep, setupUI, just in case buttons are
    // somehow active when this option is selected
    prepToStart() {

	alert("Please select an algorithm first.");
    },
    
    nextStep() {

	alert("Please select an algorithm first.");
    },

    setupUI() {},

    cleanupUI() {}
};

// vertex extremes search

// helper functions

// function to create the table entry for the leader for extreme points
function extremePointLeaderString(label, waypointNum) {
    
    return label + ':<br />#' + waypointNum +
        ' (' + waypoints[waypointNum].lat + ',' +
        waypoints[waypointNum].lon +
        ') ' + waypoints[waypointNum].label;
}

// function to create the table entry for the leader for
// label-based comparisons
function vertexLabelLeaderString(label, waypointNum) {
    
    return label + ':<br />#' + waypointNum +
        ' (length ' + waypoints[waypointNum].label.length + ') ' +
        waypoints[waypointNum].label;
}


var hdxVertexExtremesSearchAV = {

    // entries for list of AVs
    value: "vertex",
    name: "Vertex Extremes Search",
    description: "Search for extreme values based on vertex (waypoint) locations and labels.",

    // pseudocode
    code: `
<table class="pseudocode"><tr id="START" class="pseudocode"><td class="pseudocode">
north &larr; 0<br />
south &larr; 0<br />
east &larr; 0<br />
west &larr; 0<br />
longest &larr; 0<br />
shortest &larr; 0</td></tr>
<tr id="forLoopTop"><td>for (check &larr; 1 to |V|-1)</td></tr>
<tr id="checkNextCategory0"><td>
&nbsp;&nbsp;if (v[check].lat > v[north].lat)
</td></tr>
<tr id="updateNextCategory0"><td>
&nbsp;&nbsp;&nbsp;&nbsp;north &larr; check
</td></tr>
<tr id="checkNextCategory1"><td>
&nbsp;&nbsp;if (v[check].lat < v[south].lat)
</td></tr>
<tr id="updateNextCategory1"><td>
&nbsp;&nbsp;&nbsp;&nbsp;south &larr; check
</td></tr>
<tr id="checkNextCategory2"><td>
&nbsp;&nbsp;if (v[check].lng > v[east].lng)
</td></tr>
<tr id="updateNextCategory2"><td>
&nbsp;&nbsp;&nbsp;&nbsp;east &larr; check
</td></tr>
<tr id="checkNextCategory3"><td>
&nbsp;&nbsp;if (v[check].lng < v[west].lng)
</td></tr>
<tr id="updateNextCategory3"><td>
&nbsp;&nbsp;&nbsp;&nbsp;west &larr; check
</td></tr>
<tr id="checkNextCategory4"><td>
&nbsp;&nbsp;if (len(v[check].label) < len(v[shortest].label)))
</td></tr>
<tr id="updateNextCategory4"><td>
&nbsp;&nbsp;&nbsp;&nbsp;shortest &larr; check
</td></tr>
<tr id="checkNextCategory5"><td>
&nbsp;&nbsp;if (len(v[check].label) > len(v[longest].label)))
</td></tr>
<tr id="updateNextCategory5"><td>
&nbsp;&nbsp;&nbsp;&nbsp;longest &larr; check
</td></tr>
</table>
`,
    
    // state variables for vertex extremes search
    nextToCheck: 0,
    discarded: 0,
    foundNewLeader: false,
    // list of polylines showing the directional bounds, updated by
    // directionalBoundingBox function below
    boundingPoly: [],

    // the categories for which we are finding our extremes,
    // with names for ids, labels to display, indicies of leader,
    // comparison function to determine if we have a new leader,
    // and visual settings for the display
    categories: [
	{
	    name: "north",
	    label: "North extreme",
	    index: -1,

	    newLeader: function() {
		return (parseFloat(waypoints[hdxVertexExtremesSearchAV.nextToCheck].lat) >
			parseFloat(waypoints[this.index].lat));
	    },

	    leaderString: extremePointLeaderString,

	    visualSettings: {
		color: "#8b0000",
		textColor: "white",
		scale: 6,
		name: "northLeader",
		value: 0
	    }
	},

	{
	    name: "south",
	    label: "South extreme",
	    index: -1,

	    newLeader: function() {
		return (parseFloat(waypoints[hdxVertexExtremesSearchAV.nextToCheck].lat) <
			parseFloat(waypoints[this.index].lat));
	    },
	    leaderString: extremePointLeaderString,
	    
	    visualSettings: {
		color: "#ee0000",
		textColor: "white",
		scale: 6,
		name: "southLeader",
		value: 0
	    }
	},

	{
	    name: "east",
	    label: "East extreme",
	    index: -1,

	    newLeader: function() {
		return (parseFloat(waypoints[hdxVertexExtremesSearchAV.nextToCheck].lon) >
			parseFloat(waypoints[this.index].lon));
	    },
	    leaderString: extremePointLeaderString,
	    visualSettings: {
		color: "#000080",
		textColor: "white",
		scale: 6,
		name: "eastLeader",
		value: 0
	    }
	},

	{
	    name: "west",
	    label: "West extreme",
	    index: -1,

	    newLeader: function() {
		return (parseFloat(waypoints[hdxVertexExtremesSearchAV.nextToCheck].lon) <
			parseFloat(waypoints[this.index].lon));
	    },
	    leaderString: extremePointLeaderString,
	    visualSettings: {
		color: "#551A8B",
		textColor: "white",
		scale: 6,
		name: "westLeader",
		value: 0
	    }
	},

	{
	    name: "shortest",
	    label: "Shortest vertex label",
	    index: -1,
	    
	    newLeader: function() {
		return (waypoints[hdxVertexExtremesSearchAV.nextToCheck].label.length <
			waypoints[this.index].label.length);
	    },
	    leaderString: vertexLabelLeaderString,
	    visualSettings: visualSettings.shortLabelLeader
	},
	
	{
	    name: "longest",
	    label: "Longest vertex label",
	    index: -1,
	    
	    newLeader: function() {
		return (waypoints[hdxVertexExtremesSearchAV.nextToCheck].label.length >
			waypoints[this.index].label.length);
	    },
	    leaderString: vertexLabelLeaderString,
	    visualSettings: visualSettings.longLabelLeader
	},
    ],

    // the actions that make up this algorithm
    avActions: [
	{
	    label: "START",
	    comment: "initialize all leader indices to 0",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);
		for (var i = 0; i < thisAV.categories.length; i++) {
		    thisAV.categories[i].index = 0;
		}
		
		// highlight vertex 0 as leader in all categories and current
		thisAV.nextToCheck = 0;
		thisAV.discarded = 0;
	
		updateAVControlEntry("undiscovered", waypoints.length + "vertices not yet visited");
		updateAVControlEntry("visiting", "Visiting #0 (initial leader in each category: #0 " + waypoints[0].label);
		updateAVControlEntry("discarded", "0 vertices discarded");

		// show marker 0 as the leader in each category
		// on the map and in the table
		for (var i = 0; i < thisAV.categories.length; i++) {
		    updateMarkerAndTable(thisAV.categories[i].index,
					 thisAV.categories[i].visualSettings, 
					 40, false);
		    updateAVControlEntry(
			thisAV.categories[i].name, 
			thisAV.categories[i].leaderString(thisAV.categories[i].label,
							  thisAV.categories[i].index)
		    );
		}
		hdxAV.iterationDone = true;
		hdxAV.nextAction = "forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Initializing leaders to vertex 0";
	    }
	},
	{
	    label: "forLoopTop",
	    comment: "for loop to iterate over remaining vertices",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);
		thisAV.nextToCheck++;
		if (thisAV.nextToCheck == waypoints.length) {
		    hdxAV.nextAction = "cleanup";
		}
		else {
		    // highlight nextToCheck as current vertex
		    hdxAV.nextAction = "checkNextCategory";
		    thisAV.nextCategory = 0;
		    thisAV.foundNewLeader = false;
		    updateMarkerAndTable(thisAV.nextToCheck, visualSettings.visiting,
					 30, false);
		    updateAVControlEntry("undiscovered", (waypoints.length - thisAV.nextToCheck) + " vertices not yet visited");
		    updateAVControlEntry("visiting", "Visiting: #" + thisAV.nextToCheck + " " + waypoints[thisAV.nextToCheck].label);
		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Top of main for loop over vertices, check=" + thisAV.nextToCheck;
	    }
	},
	{
	    label: "checkNextCategory",
	    comment: "check if current vertex is a new category leader",
	    code: function(thisAV) {
		highlightPseudocode(this.label+thisAV.nextCategory,
				    thisAV.categories[thisAV.nextCategory].visualSettings);
		//console.log("checkNextCategory for vertex " + thisAV.nextToCheck + " in category " + thisAV.nextCategory);
		if (thisAV.categories[thisAV.nextCategory].newLeader()) {
		    hdxAV.nextAction = "updateNextCategory";
		}
		else {
		    thisAV.nextCategory++;
		    if (thisAV.nextCategory == thisAV.categories.length) {
			hdxAV.nextAction = "forLoopBottom";
		    }
		    else {
			hdxAV.nextAction = "checkNextCategory";
		    }
		}
	    },
	    logMessage: function(thisAV) {
		if (hdxAV.nextAction == "updateNextCategory") {
		    return "Check for new " + thisAV.categories[thisAV.nextCategory].label + " leader";
		}
		else {
		    return "Check for new " + thisAV.categories[thisAV.nextCategory-1].label + " leader";
		}
	    }
	},
	{
	    label: "updateNextCategory",
	    comment: "update new category leader",
	    code: function(thisAV) {

		highlightPseudocode(this.label+thisAV.nextCategory,
				    thisAV.categories[thisAV.nextCategory].visualSettings);
		// remember that we have a new leader so this doesn't
		// get discarded at the end of the loop
		thisAV.foundNewLeader = true;

		// if the old leader is still leading in some other category,
		// color it as such, and if not, discard
		let oldLeader = thisAV.categories[thisAV.nextCategory].index;
		let stillALeader = false;
		for (var i = 0; i < thisAV.categories.length; i++) {
		    if (i == thisAV.nextCategory) continue;
		    if (thisAV.categories[i].index == oldLeader) {
			stillALeader = true;
			updateMarkerAndTable(oldLeader,
					     thisAV.categories[i].visualSettings, 
					     40, false);
			break;  // could lead in others, but pick the first
		    }
		}
		if (!stillALeader) {
		    updateMarkerAndTable(oldLeader, visualSettings.discarded,
					 20, true);
		    thisAV.discarded++;
		    updateAVControlEntry("discarded", thisAV.discarded + " vertices discarded");
		}
		    
		// update this category to indicate its new leader
		// but keep it shown as the vertex being visited on the
		// map and in the table until the end of the iteration
		thisAV.categories[thisAV.nextCategory].index = thisAV.nextToCheck;

		// update bounding box
		if (thisAV.showBB) {
		    thisAV.directionalBoundingBox();
		}
		
		updateAVControlEntry(
		    thisAV.categories[thisAV.nextCategory].name, 
		    thisAV.categories[thisAV.nextCategory].leaderString(
			thisAV.categories[thisAV.nextCategory].label,
			thisAV.categories[thisAV.nextCategory].index)
		);
		thisAV.nextCategory++;
		if (thisAV.nextCategory == thisAV.categories.length) {
		    hdxAV.nextAction = "forLoopBottom";
		}
		else {
		    hdxAV.nextAction = "checkNextCategory";
		}
	    },
	    logMessage: function(thisAV) {
		return thisAV.nextToCheck + " is new " + thisAV.categories[thisAV.nextCategory-1].label + " leader";
	    }
	},
	{
	    label: "forLoopBottom",
	    comment: "end of for loop iteration",
	    code: function(thisAV){

		// if this waypoint is the leader in any category, show it,
		// otherwise it gets discarded
		if (thisAV.foundNewLeader) {
		    for (var i = 0; i < thisAV.categories.length; i++) {
			if (thisAV.nextToCheck == thisAV.categories[i].index) {
			    updateMarkerAndTable(thisAV.categories[i].index,
						 thisAV.categories[i].visualSettings, 
						 40, false);
			    break;  // just use the first we find
			}
		    }
		}
		else {
		    updateMarkerAndTable(thisAV.nextToCheck, visualSettings.discarded,
					 20, true);
		    thisAV.discarded++;
		    updateAVControlEntry("discarded", thisAV.discarded + " vertices discarded");

		}
		hdxAV.iterationDone = true;
		hdxAV.nextAction = "forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Update/discard on map and table";
	    }
	},
	{
	    label: "cleanup",
	    comment: "cleanup and updates at the end of the visualization",
	    code: function(thisAV) {
		hdxAV.algStat.innerHTML =
		    "Done! Visited " + markers.length + " waypoints.";
		updateAVControlEntry("undiscovered", "0 vertices not yet visited");
		updateAVControlEntry("visiting", "");
		hdxAV.nextAction = "DONE";
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Cleanup and finalize visualization";
	    }
	}
    ],

    // function to draw or update a bounding box of polylines
    // that encloses the directional extremes found so far
    directionalBoundingBox() {

	// note this assumes that the order of the categories
	// has north at 0, south at 1, east at 2, west at 3
	let n = waypoints[this.categories[0].index].lat;
	let s = waypoints[this.categories[1].index].lat;
	let e = waypoints[this.categories[2].index].lon;
	let w = waypoints[this.categories[3].index].lon;
	let nEnds = [[n,w],[n,e]];
	let sEnds = [[s,w],[s,e]];
	let eEnds = [[n,e],[s,e]];
	let wEnds = [[n,w],[s,w]];

	// create or update as appropriate
	if (this.boundingPoly.length == 0) {
	    this.boundingPoly.push(
		L.polyline(nEnds, {
		    color: this.categories[0].visualSettings.color,
		    opacity: 0.6,
		    weight: 3
		})
	    );
	    this.boundingPoly.push(
		L.polyline(sEnds, {
		    color: this.categories[1].visualSettings.color,
		    opacity: 0.6,
		    weight: 3
		})
	    );
	    this.boundingPoly.push(
		L.polyline(eEnds, {
		    color: this.categories[2].visualSettings.color,
		    opacity: 0.6,
		    weight: 3
		})
	    );
	    this.boundingPoly.push(
		L.polyline(wEnds, {
		    color: this.categories[3].visualSettings.color,
		    opacity: 0.6,
		    weight: 3
		})
	    );
	    for (var i = 0; i < 4; i++) {
		this.boundingPoly[i].addTo(map);
	    }
	}
	else {
	    this.boundingPoly[0].setLatLngs(nEnds);
	    this.boundingPoly[1].setLatLngs(sEnds);
	    this.boundingPoly[2].setLatLngs(eEnds);
	    this.boundingPoly[3].setLatLngs(wEnds);
	}
    },
    
    // required prepToStart function
    // initialize a vertex-based search
    prepToStart() {

	hdxAV.algStat.innerHTML = "Initializing";

	// show waypoints, hide connections
	initWaypointsAndConnections(true, false,
				    visualSettings.undiscovered);

	// honor bounding box checkbox
	this.showBB = document.getElementById("boundingBox").checked;
	
	// start the search by initializing with the value at pos 0
	updateMarkerAndTable(0, visualSettings.visiting, 40, false);
	
    },


    // set up UI for the start of this algorithm
    setupUI() {

	hdxAV.algStat.style.display = "";
	hdxAV.algStat.innerHTML = "Setting up";
        hdxAV.algOptions.innerHTML = '<input id="boundingBox" type="checkbox" name="Show Bounding Box" checked />&nbsp;Show Extremes Bounding Box';

	addEntryToAVControlPanel("undiscovered", visualSettings.undiscovered);
	addEntryToAVControlPanel("visiting", visualSettings.visiting);
	addEntryToAVControlPanel("discarded", visualSettings.discarded);
	for (var i = 0; i < this.categories.length; i++) {
	    addEntryToAVControlPanel(this.categories[i].name,
				     this.categories[i].visualSettings);
	}
    },
	
	
    // remove UI modifications made for vertex extremes search
    cleanupUI() {

	for (var i = 0; i < this.boundingPoly.length; i++) {
	    this.boundingPoly[i].remove();
	}
	this.boundingPoly = [];
    }
};

// edge extremes search

// function to create the table entry for the leader for
// label-based comparisons for edges
function edgeLabelLeaderString(label, edgeNum) {
    
    return label + ':<br />#' + edgeNum +
        ' (length ' + graphEdges[edgeNum].label.length + ') ' +
        graphEdges[edgeNum].label;
}

// function to create the table entry for the leader for
// edge-length-based comparisons for edges
function edgeLengthLeaderString(label, edgeNum) {
    
    return label + ': ' +
	edgeLengthInMiles(graphEdges[edgeNum]).toFixed(3) + ' mi<br />#' +
	edgeNum + ' ' + graphEdges[edgeNum].label + " " +
	waypoints[graphEdges[edgeNum].v1].label + ' <-> ' +
	waypoints[graphEdges[edgeNum].v2].label;
}

var hdxEdgeExtremesSearchAV = {

    // entries for list of AVs
    value: "edge",
    name: "Edge Extremes Search",
    description: "Search for extreme values based on edge (connection) lengths and labels.",

    // pseudocode
    code:`
<table class="pseudocode"><tr id="START" class="pseudocode"><td class="pseudocode">
longestLabel &larr; 0<br />
shortestLabel &larr; 0<br />
longestEdge &larr; 0<br />
shortestEdge &larr; 0</td></tr>
<tr id="forLoopTop"><td>for (checkIndex &larr; 1 to |E|-1)</td></tr>
<tr id="checkNextCategory0"><td> 
&nbsp;&nbsp;if (len(e[checkIndex].label) > len(e[longestLabel].label)))
</td></tr>
<tr id="updateNextCategory0"><td>
&nbsp;&nbsp;&nbsp;&nbsp;longestLabel &larr; checkIndex
</td></tr>
<tr id="checkNextCategory1"><td>
&nbsp;&nbsp;if (len(e[checkIndex].label) < len(e[shortestLabel].label)))
</td></tr>
<tr id="updateNextCategory1"><td>	
&nbsp;&nbsp;&nbsp;&nbsp;shortestLabel &larr; checkIndex
</td></tr>
<tr id="checkNextCategory2"><td>
&nbsp;&nbsp;if (e[checkIndex].len > e[longestEdge].len)
</td></tr>
<tr id="updateNextCategory2"><td>
&nbsp;&nbsp;&nbsp;&nbsp;longestEdge &larr; checkIndex
</td></tr>
<tr id="checkNextCategory3"><td>
&nbsp;&nbsp;if (e[checkIndex].len < e[shortestEdge].len)
</td></tr>
<tr id="updateNextCategory3"><td>
&nbsp;&nbsp;&nbsp;&nbsp;shortestEdge &larr; checkIndex
</td></tr>
</table>
`,
    
    // state variables for edge search
    // next to examine
    nextToCheck: 0,
    discarded: 0,
    foundNewLeader: false,
    // the categories for which we are finding our extremes,
    // with names for ids, labels to display, indicies of leader,
    // comparison function to determine if we have a new leader,
    // and visual settings for the display
    categories: [
	{
	    name: "shortestLabel",
	    label: "Shortest edge label",
	    index: -1,
	    
	    newLeader: function() {
		return (graphEdges[hdxEdgeExtremesSearchAV.nextToCheck].label.length <
			graphEdges[this.index].label.length);
	    },
	    leaderString: edgeLabelLeaderString,
	    visualSettings: visualSettings.shortLabelLeader
	},
	
	{
	    name: "longestLabel",
	    label: "Longest edge label",
	    index: -1,
	    
	    newLeader: function() {
		return (graphEdges[hdxEdgeExtremesSearchAV.nextToCheck].label.length >
			graphEdges[this.index].label.length);
	    },
	    leaderString: edgeLabelLeaderString,
	    visualSettings: visualSettings.longLabelLeader
	},

    	{
	    name: "shortestEdge",
	    label: "Shortest edge length",
	    index: -1,
	    
	    newLeader: function() {
		return (edgeLengthInMiles(graphEdges[hdxEdgeExtremesSearchAV.nextToCheck]) <
			edgeLengthInMiles(graphEdges[this.index]));
	    },
	    leaderString: edgeLengthLeaderString,
	    visualSettings: {
		color: "#8b0000",
		textColor: "white",
		scale: 6,
		name: "shortEdgeLeader",
		value: 0,
		weight: 8,
		opacity: 0.6
	    }
	},
	
	{
	    name: "longestEdge",
	    label: "Longest edge length",
	    index: -1,
	    
	    newLeader: function() {
		return (edgeLengthInMiles(graphEdges[hdxEdgeExtremesSearchAV.nextToCheck]) >
			edgeLengthInMiles(graphEdges[this.index]));
	    },
	    leaderString: edgeLengthLeaderString,
	    visualSettings: {
		color: "#ee0000",
		textColor: "white",
		scale: 6,
		name: "longEdgeLeader",
		value: 0,
		weight: 8,
		opacity: 0.6
	    }
	}
    ],
    
	// the actions that make up this algorithm
    avActions: [
	{
	    label: "START",
	    comment: "initialize all leader indices to 0",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);
		for (var i = 0; i < thisAV.categories.length; i++) {
		    thisAV.categories[i].index = 0;
		}
		
		// highlight edge 0 as leader in all categories and current
		thisAV.nextToCheck = 0;
		thisAV.discarded = 0;
	
		updateAVControlEntry("undiscovered", (graphEdges.length - thisAV.nextToCheck) + " edges not yet visited");
		updateAVControlEntry("visiting", "Visiting: #" + thisAV.nextToCheck + " " + graphEdges[thisAV.nextToCheck].label);
		updateAVControlEntry("discarded", thisAV.discarded + " edges discarded");

		// show edge 0 as the leader in each category
		// on the map and in the table
		for (var i = 0; i < thisAV.categories.length; i++) {
		    updatePolylineAndTable(thisAV.categories[i].index,
					 thisAV.categories[i].visualSettings, 
					  false);
		    updateAVControlEntry(
			thisAV.categories[i].name, 
			thisAV.categories[i].leaderString(thisAV.categories[i].label,
							  thisAV.categories[i].index)
		    );
		}
		hdxAV.iterationDone = true;
		hdxAV.nextAction = "forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Initializing leaders to edge 0";
	    }
	},
	{
	    label: "forLoopTop",
	    comment: "for loop to iterate over remaining edges",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);
		thisAV.nextToCheck++;
		if (thisAV.nextToCheck == graphEdges.length) {
		    hdxAV.nextAction = "cleanup";
		}
		else {
		    // highlight nextToCheck as current edge
		    hdxAV.nextAction = "checkNextCategory";
		    thisAV.nextCategory = 0;
		    thisAV.foundNewLeader = false;
		    updateAVControlEntry("undiscovered", (graphEdges.length - thisAV.nextToCheck) + " edges not yet visited");
			updateAVControlEntry("visiting", "Visiting: #" + thisAV.nextToCheck + " " + graphEdges[thisAV.nextToCheck].label);
		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Top of main for loop over edges, check=" + thisAV.nextToCheck;
	    }
	},
	{
	    label: "checkNextCategory",
	    comment: "check if current edge is a new category leader",
	    code: function(thisAV) {
		highlightPseudocode(this.label+thisAV.nextCategory,
				    thisAV.categories[thisAV.nextCategory].visualSettings);
		if (thisAV.categories[thisAV.nextCategory].newLeader()) {
		    hdxAV.nextAction = "updateNextCategory";
		}
		else {
		    thisAV.nextCategory++;
		    if (thisAV.nextCategory == thisAV.categories.length) {
			hdxAV.nextAction = "forLoopBottom";
		    }
		    else {
			hdxAV.nextAction = "checkNextCategory";
		    }
		}
	    },
	    logMessage: function(thisAV) {
		if (hdxAV.nextAction == "updateNextCategory") {
		    return "Check for new " + thisAV.categories[thisAV.nextCategory].label + " leader";
		}
		else {
		    return "Check for new " + thisAV.categories[thisAV.nextCategory-1].label + " leader";
		}
	    }
	},
	{
	    label: "updateNextCategory",
	    comment: "update new category leader",
	    code: function(thisAV) {

		highlightPseudocode(this.label+thisAV.nextCategory,
				    thisAV.categories[thisAV.nextCategory].visualSettings);
		// remember that we have a new leader so this doesn't
		// get discarded at the end of the loop
		thisAV.foundNewLeader = true;

		// if the old leader is still leading in some other category,
		// color it as such, and if not, discard
		let oldLeader = thisAV.categories[thisAV.nextCategory].index;
		let stillALeader = false;
		for (var i = 0; i < thisAV.categories.length; i++) {
		    if (i == thisAV.nextCategory) continue;
		    if (thisAV.categories[i].index == oldLeader) {
			stillALeader = true;
			updatePolylineAndTable(oldLeader,
					     thisAV.categories[i].visualSettings, 
					      false);
			break;  // could lead in others, but pick the first
		    }
		}
		if (!stillALeader) {
		    updatePolylineAndTable(oldLeader, visualSettings.discarded,
				 true);
		    thisAV.discarded++;
		    updateAVControlEntry("discarded", thisAV.discarded + " vertices discarded");
		}
		    
		// update this category to indicate its new leader
		// but keep it shown as the edge being visited on the
		// map and in the table until the end of the iteration
		thisAV.categories[thisAV.nextCategory].index = thisAV.nextToCheck;
		updateAVControlEntry(
		    thisAV.categories[thisAV.nextCategory].name, 
		    thisAV.categories[thisAV.nextCategory].leaderString(
			thisAV.categories[thisAV.nextCategory].label,
			thisAV.categories[thisAV.nextCategory].index)
		);
		thisAV.nextCategory++;
		if (thisAV.nextCategory == thisAV.categories.length) {
		    hdxAV.nextAction = "forLoopBottom";
		}
		else {
		    hdxAV.nextAction = "checkNextCategory";
		}
	    },
	    logMessage: function(thisAV) {
		return thisAV.nextToCheck + " is new " + thisAV.categories[thisAV.nextCategory-1].label + " leader";
	    }
	},
	{
	    label: "forLoopBottom",
	    comment: "end of for loop iteration",
	    code: function(thisAV){

		// if this edge is the leader in any category, show it,
		// otherwise it gets discarded
		if (thisAV.foundNewLeader) {
		    for (var i = 0; i < thisAV.categories.length; i++) {
			if (thisAV.nextToCheck == thisAV.categories[i].index) {
			    updatePolylineAndTable(thisAV.categories[i].index,
						 thisAV.categories[i].visualSettings, 
						 false);
			    break;  // just use the first we find
			}
		    }
		}
		else {
		    updatePolylineAndTable(thisAV.nextToCheck, visualSettings.discarded,
			 true);
		    thisAV.discarded++;
			updateAVControlEntry("discarded", thisAV.discarded + " edges discarded");

		}
		hdxAV.iterationDone = true;
		hdxAV.nextAction = "forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Update/discard on map and table";
	    }
	},
	{
	    label: "cleanup",
	    comment: "cleanup and updates at the end of the visualization",
	    code: function(thisAV) {
		hdxAV.algStat.innerHTML =
		    "Done! Visited " + graphEdges.length + " edges.";
		updateAVControlEntry("undiscovered", "0 edges not yet visited");
		updateAVControlEntry("visiting", "");
		hdxAV.nextAction = "DONE";
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Cleanup and finalize visualization";
	    }
		
	}
    ],
	
    // required prepToStart function
    prepToStart() {

	hdxAV.algStat.innerHTML = "Initializing";

	// hide waypoints, show connections
	initWaypointsAndConnections(false, true,
				    visualSettings.undiscovered);
    },
	
    // set up UI for the start of edge search
    setupUI() {

	hdxAV.algStat.style.display = "";
	hdxAV.algStat.innerHTML = "Setting up";
        hdxAV.algOptions.innerHTML = '';
	addEntryToAVControlPanel("undiscovered", visualSettings.undiscovered);
	addEntryToAVControlPanel("visiting", visualSettings.visiting);
	addEntryToAVControlPanel("discarded", visualSettings.discarded);
	for (var i = 0; i < this.categories.length; i++) {
	    addEntryToAVControlPanel(this.categories[i].name,
				     this.categories[i].visualSettings);
	}

    },

    // clean up edge search UI
    cleanupUI() {

    }
};

/* closest/farthest pairs of vertices, just brute force for now */
var hdxExtremePairsAV = {

    // entries for list of AVs
    value: "closestpairs",
    name: "Vertex Closest/Farthest Pairs",
    description: "Search for the closest/farthest pair of vertices (waypoints).",

    // pseudocode
    code: `
<table class="pseudocode"><tr id="START" class="pseudocode"><td class="pseudocode">
closest &larr; null<br />
d<sub>closest</sub> &larr; &infin;<br />
farthest &larr; null<br />
d<sub>farthest</sub> &larr; 0</td></tr>
<tr id="v1forLoopTop"><td>for (v<sub>1</sub> &larr; 0 to |V|-2)</td></tr>
<tr id="v2forLoopTop"><td>&nbsp;&nbsp;for (v<sub>2</sub> &larr; v1+1 to |V|-1)</td></tr>
<tr id="computeDistance"><td>
&nbsp;&nbsp;&nbsp;&nbsp;d &larr; dist(v<sub>1</sub>,v<sub>2</sub>)
</td></tr>
<tr id="checkCloseLeader"><td>
&nbsp;&nbsp;&nbsp;&nbsp;if (d < d<sub>closest</sub>)
</td></tr>
<tr id="newCloseLeader"><td>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;closest &larr; [v<sub>1</sub>,v<sub>2</sub>]<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;d<sub>closest</sub> &larr; d
</td></tr>
<tr id="checkFarLeader"><td>
&nbsp;&nbsp;&nbsp;&nbsp;if (d > d<sub>farthest</sub>)
</td></tr>
<tr id="newFarLeader"><td>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;farthest &larr; [v<sub>1</sub>,v<sub>2</sub>]<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;d<sub>farthest</sub> &larr; d
</td></tr>
</table>
`,
    
    // state variables for closest pairs search
    // loop indices
    v1: 0,
    v2: 0,

    // computed distance between v1 and v2
    d_this: 0,

    // leader info
    closest: [-1, -1],
    d_closest: Number.MAX_VALUE,
    farthest: [-1, -1],
    d_farthest: 0,

    // polylines for leaders and visiting
    lineClosest: null,
    lineFarthest: null,
    lineVisiting: null,

    // visual settings specific to closest/farthest pairs
    // NOTE: these match BFCH and should probably be given
    // common names and moved to hdxAV.visualSettings
    visualSettings: {
        v1: {
            color: "darkRed",
            textColor: "white",
            scale: 6,
	    name: "v1",
	    value: 0
	},
        v2: {
            color: "red",
            textColor: "white",
            scale: 6,
	    name: "v2",
	    value: 0
	},
	discardedv2: {
	    color: "green",
	    textColor: "black",
	    scale: 2,
	    name: "discardedv2",
	    value: 0
	}
    },
    
    // the actions that make up this algorithm
    avActions: [
	{
	    label: "START",
	    comment: "initialize closest pair variables",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);
		
		updateAVControlEntry("closeLeader", "no leader yet, d<sub>closest</sub> = &infin;");
		updateAVControlEntry("farLeader", "no leader yet, d<sub>farthest</sub> = 0");


		hdxAV.iterationDone = true;
		thisAV.v1 = -1;  // will increment to 0
		hdxAV.nextAction = "v1forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Initializing closest pair variables";
	    }
	},
	{
	    label: "v1forLoopTop",
	    comment: "outer for loop to visit all pairs of vertices",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.v1);
		thisAV.v1++;
		if (thisAV.v1 == waypoints.length-1) {
		    hdxAV.nextAction = "cleanup";
		}
		else {
		    hdxAV.nextAction = "v2forLoopTop";
		    thisAV.v2 = thisAV.v1;  // will increment to +1
		    updateMarkerAndTable(thisAV.v1, thisAV.visualSettings.v1,
					 30, false);
		    updateAVControlEntry("v1visiting", "v<sub>1</sub>: #" + thisAV.v1 + " " + waypoints[thisAV.v1].label);
		    // all subsequent vertices will be looped over and should
		    // go back to undiscovered for now
		    for (var i = thisAV.v1+1; i < waypoints.length; i++) {
			updateMarkerAndTable(i, visualSettings.undiscovered,
					     20, false);
		    }
		}
	    },
	    logMessage: function(thisAV) {
		return "Next v<sub>1</sub>=" + thisAV.v1;
	    }
	},
	{
	    label: "v2forLoopTop",
	    comment: "inner for loop to visit all pairs of vertices",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.v2);
		thisAV.v2++;
		if (thisAV.v2 == waypoints.length) {
		    hdxAV.nextAction = "v1forLoopBottom";
		}
		else {
		    hdxAV.nextAction = "computeDistance";
		    updateMarkerAndTable(thisAV.v2, thisAV.visualSettings.v2,
					 30, false);
		    updateAVControlEntry("v2visiting", "v<sub>2</sub>: #" + thisAV.v2 + " " + waypoints[thisAV.v2].label);
		    updateAVControlEntry("checkingDistance", "Distance: ");
		    thisAV.drawLineVisiting();
		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		if (hdxAV.traceActions) {
		    return "Next v<sub>2</sub>=" + thisAV.v2;
		}
		return "Checking v<sub>1</sub>=" + thisAV.v1 +
		    "and v<sub>2</sub>=" + thisAV.v2;
	    }
	},
	{
	    label: "computeDistance",
	    comment: "compute distance of current candidate pair",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);	
		thisAV.d_this = distanceInMiles(waypoints[thisAV.v1].lat,
						waypoints[thisAV.v1].lon,
						waypoints[thisAV.v2].lat,
						waypoints[thisAV.v2].lon);
		updateAVControlEntry("checkingDistance", "Distance: " + thisAV.d_this.toFixed(3));
		hdxAV.nextAction = "checkCloseLeader";

	    },
	    logMessage: function(thisAV) {
		return "Compute distance " + thisAV.d_this.toFixed(3) + " between v<sub>1</sub>=" + thisAV.v1 + " and v<sub>2</sub>=" + thisAV.v2;
	    }
	},
	{
	    label: "checkCloseLeader",
	    comment: "check if current candidate pair is the new closest pair",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);	
		if (thisAV.d_this < thisAV.d_closest) {
		    hdxAV.nextAction = "newCloseLeader";
		}
		else {
		    hdxAV.nextAction = "checkFarLeader";
		}
	    },
	    logMessage: function(thisAV) {
		return "Check if [" + thisAV.v1 + "," + thisAV.v2 + "] is the new closest pair";
	    }
	},
	{
	    label: "newCloseLeader",
	    comment: "update new closest pair",
	    code: function(thisAV) {

		highlightPseudocode(this.label, visualSettings.leader);

		// if we had previous leaders, they're no longer leaders
		if (thisAV.closest[0] != -1) {
		    // old v1 leader is now either going to be leader again
		    // below or is now discarded, so mark as discarded
		    updateMarkerAndTable(thisAV.closest[0],
					 visualSettings.discarded, 15, true);

		    // old v2 leader is either discarded if it's less than
		    // or equal to v1, unvisited on this inner iteration
		    // otherwise
		    if (thisAV.closest[1] <= thisAV.v1) {
			updateMarkerAndTable(thisAV.closest[1],
					     visualSettings.discarded, 15,
					     true);
		    }
		    else {
			updateMarkerAndTable(thisAV.closest[1],
					     thisAV.visualSettings.discardedv2,
					     15, false);
		    }
		}
		// remember the current pair as the closest
		thisAV.closest = [ thisAV.v1, thisAV.v2 ];
		thisAV.d_closest = thisAV.d_this;

		updateAVControlEntry("closeLeader", "Closest: [" + 
				     thisAV.v1 + "," + thisAV.v2 + "], d<sub>closest</sub>: " + thisAV.d_closest.toFixed(3));
		updateMarkerAndTable(thisAV.v1, visualSettings.leader,
				     40, false);
		updateMarkerAndTable(thisAV.v2, visualSettings.leader,
				     40, false);
		thisAV.updateLineClosest();
		hdxAV.nextAction = "checkFarLeader";
	    },
	    logMessage: function(thisAV) {
		return "[" + thisAV.v1 + "," + thisAV.v2 + "] new closest pair with d<sub>closest</sub>=" + thisAV.d_closest.toFixed(3);
	    }
	},
	{
	    label: "checkFarLeader",
	    comment: "check if current candidate pair is the new farthest pair",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);	
		if (thisAV.d_this > thisAV.d_farthest) {
		    hdxAV.nextAction = "newFarLeader";
		}
		else {
		    hdxAV.nextAction = "v2forLoopBottom";
		}
	    },
	    logMessage: function(thisAV) {
		return "Check if [" + thisAV.v1 + "," + thisAV.v2 + "] is the new farthest pair";
	    }
	},
	{
	    label: "newFarLeader",
	    comment: "update new farthest pair",
	    code: function(thisAV) {

		highlightPseudocode(this.label, visualSettings.leader2);

		// if we had previous leaders, they're no longer leaders
		if (thisAV.farthest[0] != -1) {
		    // old v1 leader is now either going to be leader again
		    // below or is now discarded, so mark as discarded
		    updateMarkerAndTable(thisAV.farthest[0],
					 visualSettings.discarded, 15, true);

		    // old v2 leader is either discarded if it's less than
		    // or equal to v1, unvisited on this inner iteration
		    // otherwise
		    if (thisAV.farthest[1] <= thisAV.v1) {
			updateMarkerAndTable(thisAV.farthest[1],
					     visualSettings.discarded, 15,
					     true);
		    }
		    else {
			updateMarkerAndTable(thisAV.farthest[1],
					     thisAV.visualSettings.discardedv2,
					     15, false);
		    }
		}
		// remember the current pair as the farthest
		thisAV.farthest = [ thisAV.v1, thisAV.v2 ];
		thisAV.d_farthest = thisAV.d_this;

		updateAVControlEntry("farLeader", "Farthest: [" + 
				     thisAV.v1 + "," + thisAV.v2 + "], d<sub>farthest</sub>: " + thisAV.d_farthest.toFixed(3));
		updateMarkerAndTable(thisAV.v1, visualSettings.leader2,
				     40, false);
		updateMarkerAndTable(thisAV.v2, visualSettings.leader2,
				     40, false);
		thisAV.updateLineFarthest();
		hdxAV.nextAction = "v2forLoopBottom";
	    },
	    logMessage: function(thisAV) {
		return "[" + thisAV.v1 + "," + thisAV.v2 + "] new farthest pair with d<sub>farthest</sub>=" + thisAV.d_farthest.toFixed(3);
	    }
	},
	{
	    label: "v2forLoopBottom",
	    comment: "end of outer for loop iteration",
	    code: function(thisAV){

		// undisplay the visiting segment
		thisAV.removeLineVisiting();
		
		// if the current v2 isn't part of the current closest pair
		// or current farthest pair, discard it
		if (thisAV.v2 == thisAV.closest[0] ||
		    thisAV.v2 == thisAV.closest[1]) {
		    updateMarkerAndTable(thisAV.v2,
					 visualSettings.leader,
					 40, false);
		}
		else if (thisAV.v2 == thisAV.farthest[0] ||
			 thisAV.v2 == thisAV.farthest[1]) {
		    updateMarkerAndTable(thisAV.v2,
					 visualSettings.leader2,
					 40, false);
		}
		else {
		    updateMarkerAndTable(thisAV.v2,
					 thisAV.visualSettings.discardedv2,
					 15, false);
		}
		hdxAV.iterationDone = true;
		hdxAV.nextAction = "v2forLoopTop";
	    },
	    logMessage: function(thisAV) {
		// since this is an iterationDone action, we give a
		// different log message with more info
		if (hdxAV.traceActions) {
		    return "Done processing v<sub>2</sub>=" + thisAV.v2;
		}
		let leaderOrNot;
		// would be nice to differentiate between which leader
		// or indicate both
		if (thisAV.closest[0] == thisAV.v1 &&
		    thisAV.closest[1] == thisAV.v2 ||
		    thisAV.farthest[0] == thisAV.v1 &&
		    thisAV.farthest[1] == thisAV.v2) {
		    leaderOrNot = "New leader";
		}
		else {
		    leaderOrNot = "Discarding";
		}
		return leaderOrNot + ": distance " + thisAV.d_this.toFixed(3) + " between v<sub>1</sub>=" + thisAV.v1 + " and v<sub>2</sub>=" + thisAV.v2;
	    }
	},
	{
	    label: "v1forLoopBottom",
	    comment: "end of outer for loop iteration",
	    code: function(thisAV){

		// if the current v1 isn't part of the current closest pair
		// or current farthest pair, we discard it
		if (thisAV.v1 == thisAV.closest[0] ||
		    thisAV.v1 == thisAV.closest[1]) {
		    updateMarkerAndTable(thisAV.v1,
					 visualSettings.leader,
					 40, false);
		}
		else if (thisAV.v1 == thisAV.farthest[0] ||
			 thisAV.v1 == thisAV.farthest[1]) {
		    updateMarkerAndTable(thisAV.v1,
					 visualSettings.leader2,
					 40, false);
		}
		else {
		    updateMarkerAndTable(thisAV.v1,
					 thisAV.visualSettings.discardedv2,
					 15, false);
		}
		hdxAV.nextAction = "v1forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Done processing v<sub>1</sub>=" + thisAV.v1;
	    }
	},
	{
	    label: "cleanup",
	    comment: "cleanup and updates at the end of the visualization",
	    code: function(thisAV) {

		// if the last vertex is not one of the closest pair or one
		// of the closest pair, we need to discard it
		if (waypoints.length - 1 != thisAV.closest[0] &&
		    waypoints.length - 1 != thisAV.closest[1] &&
		    waypoints.length - 1 != thisAV.farthest[0] &&
		    waypoints.length - 1 != thisAV.farthest[1]) {
		    updateMarkerAndTable(waypoints.length - 1,
					 visualSettings.discarded, 15, true);
		}
		
		updateAVControlEntry("v1visiting", "");
		updateAVControlEntry("v2visiting", "");
		updateAVControlEntry("checkingDistance", "");
		hdxAV.nextAction = "DONE";
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Done!";
	    }
	}
    ],

    // function to draw the polyline connecting the current
    // candidate pair of vertices
    drawLineVisiting() {

	let visitingLine = [];
	visitingLine[0] = [waypoints[this.v1].lat, waypoints[this.v1].lon];
	visitingLine[1] = [waypoints[this.v2].lat, waypoints[this.v2].lon];
	this.lineVisiting = L.polyline(visitingLine, {
	    color: visualSettings.visiting.color,
	    opacity: 0.6,
	    weight: 4
	});
	this.lineVisiting.addTo(map);	
    },
    
    // function to remove the visiting polyline
    removeLineVisiting() {

	this.lineVisiting.remove();
    },

    // functions to draw or update the polylines connecting the
    // current closest and furthest pairs
    updateLineClosest() {

	let closestLine = [];
	closestLine[0] = [waypoints[this.closest[0]].lat, waypoints[this.closest[0]].lon];
	closestLine[1] = [waypoints[this.closest[1]].lat, waypoints[this.closest[1]].lon];

	if (this.lineClosest == null) {
	    this.lineClosest = L.polyline(closestLine, {
		color: visualSettings.leader.color,
		opacity: 0.6,
		weight: 4
	    });
	    this.lineClosest.addTo(map);	
	}
	else {
	    this.lineClosest.setLatLngs(closestLine);
	}
    },
    updateLineFarthest() {

	let farthestLine = [];
	farthestLine[0] = [waypoints[this.farthest[0]].lat, waypoints[this.farthest[0]].lon];
	farthestLine[1] = [waypoints[this.farthest[1]].lat, waypoints[this.farthest[1]].lon];

	if (this.lineFarthest == null) {
	    this.lineFarthest = L.polyline(farthestLine, {
		color: visualSettings.leader2.color,
		opacity: 0.6,
		weight: 4
	    });
	    this.lineFarthest.addTo(map);	
	}
	else {
	    this.lineFarthest.setLatLngs(farthestLine);
	}
    },

    // required prepToStart function
    // initialize a vertex closest/farthest pairs search
    prepToStart() {

	hdxAV.algStat.innerHTML = "Initializing";

	// show waypoints, hide connections
	initWaypointsAndConnections(true, false,
				    visualSettings.undiscovered);
    },

    // set up UI entries for closest/farthest pairs
    setupUI() {

	hdxAV.algStat.style.display = "";
	hdxAV.algStat.innerHTML = "Setting up";
        hdxAV.algOptions.innerHTML = '';

	addEntryToAVControlPanel("v1visiting", this.visualSettings.v1);
	addEntryToAVControlPanel("v2visiting", this.visualSettings.v2);
	addEntryToAVControlPanel("checkingDistance", visualSettings.visiting);
	addEntryToAVControlPanel("closeLeader", visualSettings.leader);
	addEntryToAVControlPanel("farLeader", visualSettings.leader2);
    },
	
	
    // remove UI modifications made for vertex closest/farthest pairs
    cleanupUI() {

	if (this.lineClosest != null) {
	    this.lineClosest.remove();
	}
	if (this.lineFarthest != null) {
	    this.lineFarthest.remove();
	}
    }
};

/* common functionality for graph traversals, Dijkstra's, and Prim's
   algorithms, which serves as a prototype for the actual selectable
   and executable AV objects defined below */

// an object used to track entries in the LDV (see below) and
// the table of places found
//
// vIndex is the vertex we are going to
// val is a number used as the priority for Dijkstra's (as a
//    cumulative distance) or Prim's (as an edge length) or
//    a sequence number for graph traversals (informational)
// connection is the edge number traversed to get there, and
//    is -1 for the "dummy" entry that starts a spanning
//    tree or graph traversal
// the source vertex is determined from the connection
function LDVEntry(vIndex, val, connection) {
    
    this.vIndex = vIndex;
    this.val = val;
    this.connection = connection;
    // compute the other vertex of the endpoint as we'll need
    // it in a couple places
    this.fromVIndex = -1;
    if (connection != -1) {
	if (graphEdges[connection].v1 == vIndex) {
	    this.fromVIndex = graphEdges[connection].v2;
	}
	else {
	    this.fromVIndex = graphEdges[connection].v1;
	}
    }
    
    return this;
}

// function to display an LDVEntry object in HTML suitible for
// HDXLinear, set as the HDXLinear's elementHTMLCallback for
// traversal and spanning tree algorithms
// required function to display an LDV entry
function displayLDVItem(item, ldv) {
    let edgeLabel = "START";
    let edgeLabelFull = "START";
    let showFrom = "(none)";
    let showFromFull = "(none)";
    if (item.connection != -1) {
	edgeLabelFull = graphEdges[item.connection].label;
	edgeLabel = shortLabel(edgeLabelFull, ldv.maxLabelLength);
	showFrom = item.fromVIndex;
	showFromFull = "#" + item.fromVIndex + ":" +
	    waypoints[item.fromVIndex].label;
    }
    return '<span title="Edge #' + item.connection + " " + showFromFull +
	"&rarr; #" + item.vIndex + ":" + waypoints[item.vIndex].label +
	", label: " + edgeLabelFull + ", value: " +
	item.val.toFixed(ldv.valPrecision) +
	'">' + showFrom + "&rarr;" + item.vIndex + "<br />" +
	edgeLabel + "<br />" + item.val.toFixed(ldv.valPrecision) +
	"</span>";
};


var hdxTraversalsSpanningAVCommon = {

    // entries for value, name, description, code will be in
    // AV-specific objects

    // algorithm-specific options to show in the algorithm options
    // control panel should be set by any algorithm that needs them
    // in this variable
    extraAlgOptions: "",
    
    // does the algorithm support finding all components?  if so,
    // the specific AV instance should set this variable to true
    supportFindAllComponents: false,
    
    // The header for the table of found places
    foundTableHeader: "MISSING",

    // if an entry in the table should have a column for an edge
    // length (as in Prim's) or cumulative distance (as in Dijkstra's)
    // this should be set to the column header
    distEntry: "",

    // list of vertices discovered but not yet added to the spanning
    // tree/forest being constructed
    //
    // it is a stack for DFS, a queue for BFS, a list that randomly
    // returns values for RFS, a PQ for Dijkstra's or Prim's.
    //
    // elements here are objects with fields vIndex for the index of
    // this vertex and connection for the Polyline connection followed
    // to get here (so it can be colored appropriately when the
    // element comes out)
    // this is the "list of discovered vertices" or "LDV"
    ldv: null,

    // arrays of booleans to indicate if we've added/discovered
    // vertices and edges
    // should these just be attached to the Waypoint and GraphEdge objects?
    // advantage of separate arrays is no additional cleanup needed
    addedV: [],
    discoveredV: [],
    discoveredE: [],

    // are we finding a path to end, all in a component, or all components?
    stoppingCondition: "StopAtEnd",

    // why did we stop?  Used in the cleanup action.
    stoppedBecause: "StillRunning",

    // when finding all, track the lists of vertices and edges that are
    // forming the current spanning tree
    componentVList: [],
    componentEList: [],

    // starting and ending vertices for the search, as specified by the UI
    startingVertex: -1,
    endingVertex: -1,
    
    // where to start the search for an unadded vertex that will be
    // the starting vertex for the next component
    startUnaddedVSearch: 0,

    // last place to come out of the LDV, currently "visiting"
    visiting: null,

    // neighbors to loop over when a new vertex is added to the tree
    // and the one being visited
    neighborsToLoop: [],
    nextNeighbor: -1,
    
    // some additional stats to maintain and display
    numVSpanningTree: 0,
    numESpanningTree: 0,
    numVUndiscovered: 0,
    numEUndiscovered: 0,
    numEDiscardedOnDiscovery: 0,
    numEDiscardedOnRemoval: 0,
    componentNum: 0,

    // when finding a path from start to end, we need a list of tree
    // edges to traverse to find the path
    treeEdges: [],

    // color items specific to graph traversals/spanning trees
    visualSettings: {
	addedEarlier: {
            color: "orange",
            textColor: "black",
            scale: 4,
	    name: "addedEarlier",
	    value: 0
	},
	completedComponent: {
	    color: "black",
	    textColor: "white",
	    scale: 3,
	    name: "completedComponent",
	    value: 0,
	    weight: 3,
	    opacity: 0.6
	},
	foundPath: {
	    color: "darkRed",
	    textColor: "white",
	    scale: 4,
	    name: "foundPath",
	    weight: 4,
	    opacity: 0.6
	}
    },

    // list of colors to fill in for completed components
    componentColors: [
	"orange",
	"darkCyan",
	"brown",
	"crimson",
	"lightCoral",
	"moccasin",
	"orchid",
	"sienna",
	"violet",
	"yellowGreen",
	"gold",
	"aqua",
	"dodgerblue",
	"lawngreen",
	"khaki",
	"lime",
	"firebrick",
	"indianred",
	"indigo",
	"goldenrod"
    ],

    // actions to define the behavior of the common traversals
    // and spanning tree algorithms
    avActions: [
	{
	    label: "START",
	    comment: "initialize algorithm",
	    code: function(thisAV) {

		highlightPseudocode(this.label, visualSettings.visiting);

		// initialize our added/discovered arrays
		thisAV.addedV = new Array(waypoints.length).fill(false);
		thisAV.discoveredV = new Array(waypoints.length).fill(false);
		thisAV.discoveredE = new Array(connections.length).fill(false);
		
		thisAV.numVSpanningTree = 0;
		thisAV.numESpanningTree = 0;
		thisAV.numVUndiscovered = waypoints.length;
		thisAV.numEUndiscovered = connections.length;
		thisAV.numEDiscardedOnDiscovery = 0;
		thisAV.numEDiscardedOnRemoval = 0;
		thisAV.componentNum = 0;

		// for the search for starting vertices for multiple
		// component traversals
		thisAV.startUnaddedVSearch = 0;
		
		// vertex index to start the traversal
		thisAV.startingVertex =
		    document.getElementById("startPoint").value;
		// if going to an end vertex, get that as well
		if (thisAV.stoppingCondition == "StopAtEnd") {
		    thisAV.endingVertex =
			document.getElementById("endPoint").value;
		}

		// show end vertex
		if (thisAV.stoppingCondition == "StopAtEnd") {
		    updateMarkerAndTable(thisAV.endingVertex,
					 visualSettings.endVertex,
					 4, false);
		}
		
		// start vertex is "discovered"
		thisAV.discoveredV[thisAV.startingVertex] = true;
		thisAV.numVUndiscovered--;
		
		// mark as discovered, will be redrawn as starting vertex
		// color in nextStep
		updateMarkerAndTable(thisAV.startingVertex,
				     visualSettings.discovered, 10, false);
		
		// add null edge to start vertex to LDV
		thisAV.ldv.add(new LDVEntry(thisAV.startingVertex, 0, -1));
		
		thisAV.updateControlEntries();
		
		if (thisAV.stoppingCondition == "StopAtEnd") {
		    hdxAV.nextAction = "checkEndAdded";
		}
		else if (thisAV.stoppingCondition == "FindReachable") {
		    hdxAV.nextAction = "checkComponentDone";
		}
		else {
		    thisAV.allComponentsDone = false;
		    hdxAV.nextAction = "checkAllComponentsDone";
		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Initializing";
	    }
	},
	{
	    // this action happens only when finding all components
	    label: "checkAllComponentsDone",
	    comment: "Check if more components remain to be found",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		if (thisAV.allComponentsDone) {
		    thisAV.stoppedBecause = "FoundAllComponents";
		    hdxAV.nextAction = "cleanup";
		}
		else {
		    hdxAV.nextAction = "checkComponentDone";
		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Checking if all components have been found";
	    }
	},
	{
	    label: "checkComponentDone",
	    comment: "Check if the current component is completely added",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// if the LDV is empty, we either need to move
		// on to set up for a new component (if finding
		// all) or are completely done if traversing
		// only the component containing the starting
		// vertex
		if (thisAV.ldv.isEmpty()) {
		    if (thisAV.stoppingCondition == "FindAll") {
			hdxAV.nextAction = "finalizeComponent";
		    }
		    else {
			thisAV.stoppedBecause = "FoundComponent";
			hdxAV.nextAction = "cleanup";
		    }
		}
		else {
		    hdxAV.nextAction = "getPlaceFromLDV";
		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Check if the " + thisAV.ldv.displayName + " is empty";
	    }
	},
	{
	    // this is the top of the main loop when looking for a
	    // path to a specific end vertex
	    label: "checkEndAdded",
	    comment: "Check if we have added the end vertex",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// check if end is visited, if so, cleanup, otherwise,
		// check that there are more values in the LDV to see
		// if we can continue
		if (thisAV.addedV[thisAV.endingVertex]) {
		    thisAV.stoppedBecause = "FoundPath";
		    hdxAV.nextAction = "cleanup";
		}
		else {
		    hdxAV.nextAction = "checkLDVEmpty";
		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Check if the end vertex has been added.";
	    }
	},
	{
	    label: "checkLDVEmpty",
	    comment: "Check if the LDV is empty (in which case no path exists)",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// if empty, go to LDVEmpty to report failure,
		// otherwise carry on
		if (thisAV.ldv.isEmpty()) {
		    hdxAV.nextAction = "LDVEmpty";
		}
		else {
		    hdxAV.nextAction = "getPlaceFromLDV";
		}
	    },
	    logMessage: function(thisAV) {
		return "Check if the " + thisAV.ldv.displayName + " is empty";
	    }
	},
	{
	    label: "LDVEmpty",
	    comment: "LDV is empty, no path exists",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.searchFailed);

		thisAV.stoppedBecause = "SearchFailed";
		hdxAV.nextAction = "cleanup";
	    },
	    logMessage: function(thisAV) {
		return "The " + thisAV.ldv.displayName +
		    " is empty, no path to end vertex exists.";
	    }
	},
	{
	    label: "getPlaceFromLDV",
	    comment: "Get a place from the LDV",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// get next place from the LDV
		thisAV.visiting = thisAV.ldv.remove();
		updateAVControlEntry("visiting", "Visiting " +
				     thisAV.formatLDVEntry(thisAV.visiting));
		// show on map as visiting color
		updateMarkerAndTable(thisAV.visiting.vIndex,
				     visualSettings.visiting,
				     10, false);
		if (thisAV.visiting.connection != -1) {
		    updatePolylineAndTable(thisAV.visiting.connection,
					   visualSettings.visiting,
					   false);
		}
		
		hdxAV.nextAction = "checkAdded";
	    },
	    logMessage: function(thisAV) {
		return "Removed " +
		    thisAV.formatLDVEntry(thisAV.visiting) + " from " +
		    thisAV.ldv.displayName;
	    }
	},
	{
	    label: "checkAdded",
	    comment: "Check if the place being visited was previously added",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		if (thisAV.addedV[thisAV.visiting.vIndex]) {
		    // already in the tree, discard "on removal"
		    hdxAV.nextAction = "wasAdded";
		}
		else {
		    hdxAV.nextAction = "wasNotAdded";
		}
	    },
	    logMessage: function(thisAV) {
		return "Checking if #" + thisAV.visiting.vIndex +
		    " was previously added";
	    }
	},
	{
	    label: "wasAdded",
	    comment: "Place being visited already added, so discard",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.discarded);

		thisAV.numEDiscardedOnRemoval++;

		// check if this vertex is still in the LDV, will be
		// discarded or added later
		if (thisAV.visiting.vIndex == thisAV.startingVertex) {
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 visualSettings.startVertex,
					 4, false);
		}
		else if (thisAV.visiting.vIndex == thisAV.endingVertex) {
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 visualSettings.endVertex,
					 4, false);
		}
		else if (thisAV.ldv.containsFieldMatching("vIndex", thisAV.visiting.vIndex)) {
		    // not there anymore, indicated this as
		    // visitedEarlier, and will be discarded or marked
		    // as discoveredEarlier on the next iteration
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 thisAV.visualSettings.addedEarlier,
					 4, false);
		}
		else {
		    // still to be seen again, so mark is as discovered on
		    // removal
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 visualSettings.discarded,
					 5, false);
		}
            
		
		// in either case here, the edge that got us here is not
		// part of the ultimate spanning tree, so it should be the
		// "discardedOnRemoval" color
		if (thisAV.visiting.connection != -1) {
		    updatePolylineAndTable(thisAV.visiting.connection,
					   visualSettings.discarded,
					   false);
		    
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 visualSettings.discarded,
					 5, false);
		}

		thisAV.updateControlEntries();

		// continue at the top of the appropriate loop
		if (thisAV.stoppingCondition == "StopAtEnd") {
		    hdxAV.nextAction = "checkEndAdded";
		}
		else {
		    hdxAV.nextAction = "checkComponentDone";
		}
	    },
	    logMessage: function(thisAV) {
		return "Discarding " +
		    thisAV.formatLDVEntry(thisAV.visiting) + " on removal";
	    }
	},
	{
	    label: "wasNotAdded",
	    comment: "Found path to new place, so add it to tree",
	    code: function(thisAV) {
		highlightPseudocode(this.label,
				    visualSettings.spanningTree);

		thisAV.addedV[thisAV.visiting.vIndex] = true;
		if (thisAV.visiting.vIndex == thisAV.startingVertex) {
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 visualSettings.startVertex,
					 4, false);
		}
		else if (thisAV.visiting.vIndex == thisAV.endingVertex) {
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 visualSettings.endVertex,
					 4, false);
		}
		else {
		    updateMarkerAndTable(thisAV.visiting.vIndex,
					 visualSettings.spanningTree,
					 10, false);
		}
		// was just discovered, now part of spanning tree
		thisAV.componentVList.push(thisAV.visiting.vIndex);
		thisAV.numVSpanningTree++;
	    
		// we used the edge to get here, so let's mark it as such
		if (thisAV.visiting.connection != -1) {
		    thisAV.numESpanningTree++;
		    thisAV.componentEList.push(thisAV.visiting.connection);
		    updatePolylineAndTable(thisAV.visiting.connection,
					   visualSettings.spanningTree,
					   false);
		}

		thisAV.addLDVEntryToFoundTable(thisAV.visiting,
					       thisAV.ldv.maxLabelLength,
					       thisAV.ldv.valPrecision,
					       thisAV.numESpanningTree);

		// if we're finding a path from a start to an end, update
		// our array of tree edges to trace back through to find
		// paths
		if (thisAV.stoppingCondition == "StopAtEnd") {
		    thisAV.treeEdges.push(thisAV.visiting);
		}
		
		thisAV.updateControlEntries();
		hdxAV.nextAction = "checkNeighborsLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Adding " + thisAV.formatLDVEntry(thisAV.visiting) + " to tree";
	    }
	},
	{
	    label: "checkNeighborsLoopTop",
	    comment: "Top of loop over edges from vertex just added",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// build list of neighbors to visit
		let neighbors = getAdjacentPoints(thisAV.visiting.vIndex);
		for (var i = 0; i < neighbors.length; i++) {
                    let connection = waypoints[thisAV.visiting.vIndex].edgeList[i].edgeListIndex;
		    // add to list of neighbors unless it's where we just
		    // came from
		    if (connection != thisAV.visiting.connection) {
			thisAV.neighborsToLoop.push({
			    to: neighbors[i],
			    via: connection
			});
		    }
		}

		// either go into the loop or jump over it if
		// there are no neighbors
		if (thisAV.neighborsToLoop.length > 0) {
		    hdxAV.nextAction = "checkNeighborsLoopIf";
		}
		else if (thisAV.stoppingCondition == "StopAtEnd") {
		    hdxAV.nextAction = "checkEndAdded";
		}
		else {
		    hdxAV.nextAction = "checkComponentDone";
		}
	    },
	    logMessage: function(thisAV) {
		if (thisAV.neighborsToLoop.length > 0) {
		    return "Looping over " + thisAV.neighborsToLoop.length +
			" neighbors";
		}
		else {
		    return "No neighbors to loop over";
		}
	    }
	},
	{
	    label: "checkNeighborsLoopIf",
	    comment: "Check the next neighbor of an added vertex",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// grab the next neighbor and check if it's in the
		// tree already
		thisAV.nextNeighbor = thisAV.neighborsToLoop.pop();

		if (thisAV.addedV[thisAV.nextNeighbor.to]) {
		    hdxAV.nextAction = "checkNeighborsLoopIfTrue";
		}
		else {
		    hdxAV.nextAction = "checkNeighborsLoopIfFalse";
		}
	    },
	    logMessage: function(thisAV) {
		return "Checking if #" + thisAV.nextNeighbor.to +
		    " is in the tree";
	    }
	},
	{
	    label: "checkNeighborsLoopIfTrue",
	    comment: "Neighbor already visited, discard on discovery",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.discardedOnDiscovery);
		thisAV.numEDiscardedOnDiscovery++;
		if (!thisAV.discoveredE[thisAV.nextNeighbor.via]) {
			thisAV.numEUndiscovered--;
			thisAV.discoveredE[thisAV.nextNeighbor.via] = true;
		    }
		    updatePolylineAndTable(thisAV.nextNeighbor.via,
					   visualSettings.discardedOnDiscovery,
					   false);

		thisAV.updateControlEntries();
		
		// either go back to the top of the loop or jump over it if
		// there are no more neighbors
		if (thisAV.neighborsToLoop.length > 0) {
		    hdxAV.nextAction = "checkNeighborsLoopIf";
		}
		else if (thisAV.stoppingCondition == "StopAtEnd") {
		    hdxAV.nextAction = "checkEndAdded";
		}
		else {
		    hdxAV.nextAction = "checkComponentDone";
		}
	    },
	    logMessage: function(thisAV) {
		return "#" + thisAV.nextNeighbor.to + " via " +
		    graphEdges[thisAV.nextNeighbor.via].label +
		    " already visited, discarding on discovery";
	    }
	},
	{
	    label: "checkNeighborsLoopIfFalse",
	    comment: "Neighbor not yet visited, add to LDV",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.discovered);

		// not been here, we've discovered somewhere new
		// possibly discovered a new vertex and
		// definitely discovered a new edge
		if (!thisAV.discoveredV[thisAV.nextNeighbor.to]) {
			thisAV.numVUndiscovered--;
			thisAV.discoveredV[thisAV.nextNeighbor.to] = true;
		}
		thisAV.numEUndiscovered--;
		thisAV.discoveredE[thisAV.nextNeighbor.via] = true;
                thisAV.ldv.add(new LDVEntry(thisAV.nextNeighbor.to,
					    thisAV.valForLDVEntry(thisAV.visiting, thisAV.nextNeighbor),
					    thisAV.nextNeighbor.via));

		// keep ending vertex color if it's the end
		if (thisAV.endingVertex == thisAV.nextNeighbor.to) {
		    updateMarkerAndTable(thisAV.nextNeighbor.to,
					 visualSettings.endVertex,
					 4, false);
		}
		else {
		    updateMarkerAndTable(thisAV.nextNeighbor.to,
					 visualSettings.discovered,
					 5, false);
		}
                // also color the edge we followed to get to this
                // neighbor as the same color to indicate it's a candidate
                // edge followed to find a current discovered but
                // unvisited vertex
                if (thisAV.nextNeighbor.via != -1) {
		    updatePolylineAndTable(thisAV.nextNeighbor.via,
					   visualSettings.discovered,
					   false);
                }
		else {
		    console.log("Unexpected -1 connection");
                }
		
		thisAV.updateControlEntries();

		// either go back to the top of the loop or jump over it if
		// there are no more neighbors
		if (thisAV.neighborsToLoop.length > 0) {
		    hdxAV.nextAction = "checkNeighborsLoopIf";
		}
		else if (thisAV.stoppingCondition == "StopAtEnd") {
		    hdxAV.nextAction = "checkEndAdded";
		}
		else {
		    hdxAV.nextAction = "checkComponentDone";
		}
	    },
	    logMessage: function(thisAV) {
		return "#" + thisAV.nextNeighbor.to + " via " +
		    graphEdges[thisAV.nextNeighbor.via].label +
		    " added to " + thisAV.ldv.displayName;
	    }
	},
	{
	    label: "finalizeComponent",
	    comment: "Finalize completed component",
	    code: function(thisAV) {

		// we'll be using the "completedComponent"  visualSettings
		// object to highlight the component, just need to set its
		// color to the one for the component number first

		let vs = {
		    textColor: "white",
		    scale: 3,
		    name: "completedComponent" + thisAV.componentNum,
		    value: 0,
		    weight: 3,
		    opacity: 0.6
		};
		
		if (thisAV.componentNum < thisAV.componentColors.length) {
		    vs.color = thisAV.componentColors[thisAV.componentNum];
		}
		else {
		    // out of pre-defined colors, so generate a random one
		    // credit https://www.paulirish.com/2009/random-hex-color-code-snippets/
		    vs.color = '#'+Math.floor(Math.random()*16777215).toString(16);
		}

		highlightPseudocode(this.label, vs);

		// color all vertices and edges in this complete component color
		for (var i = 0; i < thisAV.componentVList.length; i++) {
		    updateMarkerAndTable(thisAV.componentVList[i], vs, false);
		}
		for (var i = 0; i < thisAV.componentEList.length; i++) {
		    updatePolylineAndTable(thisAV.componentEList[i], vs, false);
		}
		
		hdxAV.nextAction = "checkAnyUnadded";
	    },
	    logMessage: function(thisAV) {
		return "Finalized component " + thisAV.componentNum + " with " +
		    thisAV.componentVList.length + " vertices, " +
		    thisAV.componentEList.length + " edges.";
		    
	    }
	},
	{
	    label: "checkAnyUnadded",
	    comment: "Check if there are more vertices not yet in the forest",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		if (waypoints.length != thisAV.numVSpanningTree) {
		    hdxAV.nextAction = "startNewComponent";
		}
		else {
		    hdxAV.nextAction = "doneToTrue";
		}
	    },
	    logMessage: function(thisAV) {
		return "Checking if all vertices have been added to a tree";
	    }
	},
	{
	    label: "startNewComponent",
	    comment: "Start work on the next connected component",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// clear components
		thisAV.componentVList = [];
		thisAV.componentEList = [];

		// increment to next component
		thisAV.componentNum++;

		// select a starting vertex for the next component
		while (thisAV.addedV[thisAV.startUnaddedVSearch]) {
		    thisAV.startUnaddedVSearch++;
		}

		// start up new component at this vertex
		thisAV.discoveredV[thisAV.startUnaddedVSearch] = true;
		thisAV.numVUndiscovered--;
		
		updateMarkerAndTable(thisAV.startUnaddedVSearch,
				     visualSettings.discovered, 10, false);
		
		thisAV.ldv.add(new LDVEntry(thisAV.startUnaddedVSearch, 0, -1));

		thisAV.updateControlEntries();

		hdxAV.iterationDone = true;
		hdxAV.nextAction = "checkAllComponentsDone";
	    },
	    logMessage: function(thisAV) {
		return "Starting component " + thisAV.componentNum +
		    " with vertex " + thisAV.startUnaddedVSearch;
	    }
	},
	{
	    label: "doneToTrue",
	    comment: "All vertices added, so no more components",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		thisAV.allComponentsDone = true;
		hdxAV.nextAction = "checkAllComponentsDone";
	    },
	    logMessage: function(thisAV) {
		return "All components found, setting done flag to true";
	    }
	},
	{
	    label: "cleanup",
	    comment: "Clean up and finalize visualization",
	    code: function(thisAV) {

		// if we found a path start to end, we replace the
		// full table of found places with just the path found
		if (thisAV.stoppedBecause == "FoundPath") {
		    // build the path we have found from end to start, showing
		    // each on the map and in the tables
		    let place = thisAV.endingVertex;
		    let plIndex = thisAV.treeEdges.length - 1;
		    let hops = 0;
		    // work our way back up the table from vertex to vertex
		    // along the path from the end back to the start
		    while (place != thisAV.startingVertex) {
			let treeEdge = thisAV.treeEdges[plIndex];
			while (place != treeEdge.vIndex) {
			    // hide line, it's not part of the path
			    if (place != thisAV.endingVertex) {
				let tr = document.getElementById("foundPaths" + plIndex);
				tr.style.display = "none";
			    }
			    plIndex--;
			    treeEdge = thisAV.treeEdges[plIndex];
			}

			hops++;
			// we are at the next place on the path, update vertex
			updateMarkerAndTable(place,
					     thisAV.visualSettings.foundPath,
					     5, false);
			// and update edge to get here
			updatePolylineAndTable(treeEdge.connection,
					       thisAV.visualSettings.foundPath,
					       false);
			
			// update place to the previous in the path
			plIndex--;
			place = treeEdge.fromVIndex;
		    }
		    updateAVControlVisualSettings("found",
						  thisAV.visualSettings.foundPath);
		    document.getElementById("foundEntriesCount").innerHTML = "";
		    thisAV.foundLabel.innerHTML = "Path found with " + hops + " hops:";
		}
		hdxAV.nextAction = "DONE";
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		if (thisAV.stoppedBecause == "SearchFailed") {
		    return "No path found from #" + thisAV.startingVertex +
			" " + waypoints[thisAV.startingVertex].label + " to #" +
			thisAV.endingVertex + " " +
			waypoints[thisAV.endingVertex].label;
		}
		else if (thisAV.stoppedBecause == "FoundPath") {
		    return "Found path from #" + thisAV.startingVertex +
			" " + waypoints[thisAV.startingVertex].label + " to #" +
			thisAV.endingVertex + " " +
			waypoints[thisAV.endingVertex].label;
		}
		else if (thisAV.stoppedBecause == "FoundComponent") {
		    return "Found all paths from #" + thisAV.startingVertex +
			" " + waypoints[thisAV.startingVertex].label;
		}
		else if (thisAV.stoppedBecause == "FoundAllComponents") {
		    return "Found all " + (thisAV.componentNum+1) +
			" components";
		}
		else {
		    return "There should be no other reasons for stopping...";
		}
	    }
	}
    ],

    updateControlEntries() {
	updateAVControlEntry("undiscovered", "Undiscovered: " +
			     this.numVUndiscovered + " V, " +
			     this.numEUndiscovered + " E");
	let label;
	let componentCount = "";
	if (this.stoppingCondition == "FindAll") {
	    label = "Spanning Forest: ";
	    componentCount = ", " + (this.componentNum+1) + " components";
	}
	else {
	    label = "Spanning Tree: "
	}
	updateAVControlEntry("currentSpanningTree", label +
			     this.numVSpanningTree + " V, " +
			     this.numESpanningTree + " E" + componentCount);
	updateAVControlEntry("discardedOnDiscovery", "Discarded on discovery: " +
			     this.numEDiscardedOnDiscovery + " E");
	updateAVControlEntry("discardedOnRemoval", "Discarded on removal: " +
			     this.numEDiscardedOnRemoval + " E");

    },

    // format an LDV entry for addition to the found table
    addLDVEntryToFoundTable(item, maxLabelLength, precision, count) {

	let newtr = document.createElement("tr");
	let edgeLabel;
	let fullEdgeLabel;
	let fromLabel;
	let fullFromLabel;
	let vLabel = shortLabel(waypoints[item.vIndex].label, 10);
	if (item.connection == -1) {
	    edgeLabel = "(START)";
	    fullEdgeLabel = "(START)";
	    fromLabel = "";
	    fullFrom = "";
	}
	else {
	    fullEdgeLabel = graphEdges[item.connection].label;
	    edgeLabel = shortLabel(fullEdgeLabel, 10);
	    fromLabel = shortLabel(waypoints[item.fromVIndex].label, 10);
	    fullFrom = "From #" + item.fromVIndex + ":" +
		waypoints[item.fromVIndex].label;
	}

	// mouseover title
	newtr.setAttribute("title",
			   "Path to #" + item.vIndex + ":" +
			   waypoints[item.vIndex].label + ", " +
			   this.distEntry + ": " +
			   item.val.toFixed(precision) + ", " + fullFrom +
			   ", via " + fullEdgeLabel);

	// id to show shortest paths later
	newtr.setAttribute("id", "foundPaths" + count);
	
	// actual table row to display
	newtr.innerHTML = 
	    '<td>' + vLabel + '</td>' +
	    '<td>' + item.val.toFixed(precision) + '</td>' +
	    '<td>' + fromLabel + '</td>' +
	    '<td>' + edgeLabel + '</td>';
	
	this.foundTBody.appendChild(newtr);
	document.getElementById("foundEntriesCount").innerHTML =
	    this.numESpanningTree;	
    },

    // format an LDV entry for display in a log message
    formatLDVEntry(item) {

	let vIndex = item.vIndex;
	let edgeLabel;
	if (item.connection == -1) {
	    edgeLabel = ", the starting vertex";
	}
	else {
	    edgeLabel = " found via " +
		graphEdges[item.connection].label;
	}
	return "#" + vIndex + " " + waypoints[vIndex].label + edgeLabel;
    },
    
    // required prepToStart function, here do things common to all
    // traversals/spanning algorithms
    prepToStart() {

	hdxAV.algStat.innerHTML = "Initializing";

	// show waypoints, show connections
	initWaypointsAndConnections(true, true,
				    visualSettings.undiscovered);

	// each algorithm will be required to provide a function
	// to create its LDV
	this.ldv = this.createLDV();

	// set the comparator if there is one (for priority queue LDVs)
	if (this.hasOwnProperty("comparator")) {
	    this.ldv.setComparator(this.comparator);
	}

	// add LDV to display element and set its callback to
	// display an individual entry
	// note that this means each algorithm must provide a function
	// named displayLDVItem that takes an LDV entry as its
	// parameter
	this.ldv.setDisplay(getAVControlEntryDocumentElement("discovered"),
			    displayLDVItem);

	// update stopping condition
	let selector = document.getElementById("stoppingCondition");
	this.stoppingCondition =
	    selector.options[selector.selectedIndex].value;
	
	// pseudocode will depend on specific options chosen, so set up
	// the code field based on the options in use
	this.setupCode();
    },

    // set up common UI components for traversals/spanning trees
    setupUI() {
	hdxAV.algStat.style.display = "";
	hdxAV.algStat.innerHTML = "Setting up";
	let newAO =
	    buildWaypointSelector("startPoint", "Start Vertex", 0) +
	    "<br />" +
	    buildWaypointSelector("endPoint", "End Vertex", 1) + `
<br />
<select id="stoppingCondition" onchange="stoppingConditionChanged();">
<option value="StopAtEnd" selected>Stop When End Vertex Reached</option>
<option value="FindReachable">Find All Vertices Reachable from Start</option>
`;
	if (this.supportFindAllComponents) {
	    newAO += '<option value="FindAll">Find All Connected Components</option>';
	}
	newAO += '</select>';
        hdxAV.algOptions.innerHTML = newAO + this.extraAlgOptions;
	addEntryToAVControlPanel("visiting", visualSettings.visiting);
	addEntryToAVControlPanel("undiscovered", visualSettings.undiscovered);
	addEntryToAVControlPanel("discovered", visualSettings.discovered);
	addEntryToAVControlPanel("currentSpanningTree", visualSettings.spanningTree);
	addEntryToAVControlPanel("discardedOnDiscovery", visualSettings.discardedOnDiscovery);
	addEntryToAVControlPanel("discardedOnRemoval", visualSettings.discarded);
	addEntryToAVControlPanel("found", visualSettings.spanningTree);
	let foundEntry = '<span id="foundEntriesCount">0</span>' +
	    ' <span id="foundTableLabel">' +
	    this.foundTableHeader + '</span><br />' +
	    '<table class="gratable"><thead>' +
	    '<tr style="text-align:center"><th>Place</th>';
	if (this.distEntry != "") {
	    foundEntry += '<th>' + this.distEntry + '</th>';
	}
	foundEntry += '<th>Arrive From</th><th>Via</th></tr>' +
	    '</thead><tbody id="foundEntries"></tbody></table>';
	updateAVControlEntry("found", foundEntry);
	this.foundTBody = document.getElementById("foundEntries");
	this.foundLabel = document.getElementById("foundTableLabel");
    },

    // clean up common UI components
    cleanupUI() {

    }
};

// event handler when stopping condition option selector changes
function stoppingConditionChanged() {

    let selector = document.getElementById("stoppingCondition");
    let endSelector = document.getElementById("endPoint");
    endSelector.disabled =
	selector.options[selector.selectedIndex].value != "StopAtEnd";
}

/* graph traversals based on hdxTraversalsSpanningAVCommon */

var hdxGraphTraversalsAV = Object.create(hdxTraversalsSpanningAVCommon);

// entries for the list of AVs
hdxGraphTraversalsAV.value = "traversals";
hdxGraphTraversalsAV.name = "Graph Traversals/Connected Components";
hdxGraphTraversalsAV.description = "Perform graph traversal using breadth-first, depth-first, or random-first traversals, with the option of iterating to find all connected components of the graph.";
hdxGraphTraversalsAV.foundTableHeader = "Edges in Spanning Tree/Forest";

// extra selector for traversal disciplines
hdxGraphTraversalsAV.extraAlgOptions = `<br />
Order: <select id="traversalDiscipline">
<option value="BFS">Breadth First</option>
<option value="DFS">Depth First</option>
<option value="RFS">Random</option>
</select>`;

hdxGraphTraversalsAV.distEntry = "Hops";

// required function to create an appropriate list of discovered vertices
hdxGraphTraversalsAV.createLDV = function() {
    
    let d = document.getElementById("traversalDiscipline");
    this.traversalDiscipline = d.options[d.selectedIndex].value;
    let ldv;
    if (this.traversalDiscipline == "BFS") {
        ldv = new HDXLinear(hdxLinearTypes.QUEUE,
			    "BFS Discovered Queue");
    }
    else if (this.traversalDiscipline == "DFS") {
        ldv = new HDXLinear(hdxLinearTypes.STACK,
			    "DFS Discovered Stack");
    }
    else {
	ldv= new HDXLinear(hdxLinearTypes.RANDOM,
			   "RFS Discovered List");
    }
    ldv.valPrecision = 0;  // whole numbers here
    return ldv;
};

// function to determine the next "val" field for a new LDV entry
// in this case, 1 more than the old, so the values indicate the
// number of hops from the start
//
// first parameter is the LDV entry being visited at this point,
// second parameter is the destination vertex and edge traversed
// to get from the vertex being visited
hdxGraphTraversalsAV.valForLDVEntry = function(oldEntry, nextNeighbor) {

    return oldEntry.val + 1;
}

// helper function to help build pseudocode
hdxGraphTraversalsAV.mainLoopBody = function(indent) {

    return pcEntry(indent+1, "(to,via) &larr; d." +
		   this.ldv.removeOperation() + "()", "getPlaceFromLDV") +
	pcEntry(indent+1, "if tree.contains(to)", "checkAdded") +
	pcEntry(indent+2, "discard (to,via) // on removal", "wasAdded") +
	pcEntry(indent+1, "else", "") +
	pcEntry(indent+2, "tree.add(to,via)", "wasNotAdded") +
	pcEntry(indent+2, "for each e = (to,v) // neighbors",
		"checkNeighborsLoopTop") +
	pcEntry(indent+3, "if tree.contains(v)", "checkNeighborsLoopIf") +
	pcEntry(indent+4, "discard (v,e) // on discovery",
		"checkNeighborsLoopIfTrue") +
	pcEntry(indent+3, "else", "") +
	pcEntry(indent+4, "d." + this.ldv.addOperation() + "(v,e)", 
		"checkNeighborsLoopIfFalse");

};

// graph traversals-specific psuedocode, note labels must match those
// expected by hdxTraversalsSpanningAVCommon avActions
hdxGraphTraversalsAV.setupCode = function() {

    let initializeCode = [ "d &larr; new " + this.ldv.displayName,
			   "d." + this.ldv.addOperation() + "(start,null)" ];
    if (this.stoppingCondition == "FindAll") {
	initializeCode.push("done &larr; false");
    }
    this.code = '<table class="pseudocode">' +
	pcEntry(0, initializeCode, "START");
    if (this.stoppingCondition == "StopAtEnd") {
	this.code +=
	    pcEntry(0, "while not tree.contains(end)", "checkEndAdded") +
	    pcEntry(1, "if d.isEmpty", "checkLDVEmpty") +
	    pcEntry(2, "error: no path", "LDVEmpty") +
	    this.mainLoopBody(0);
    }
    else if (this.stoppingCondition == "FindReachable") {
	this.code +=
	    pcEntry(0, "while not d.isEmpty", "checkComponentDone") +
	    this.mainLoopBody(0);

    }
    else { // this.stoppingCondition == "FindAll"
	this.code +=
	    pcEntry(0, "while not done", "checkAllComponentsDone") +
	    pcEntry(1, "while not d.isEmpty", "checkComponentDone") +
	    this.mainLoopBody(1) +
	    pcEntry(1, "// finalize component", "finalizeComponent") +
	    pcEntry(1, "if &exist; any unadded vertices", "checkAnyUnadded") +
	    pcEntry(2, [ "v &larr; any unadded vertex",
			 "d." + this.ldv.addOperation() + "(v,null)" ],
		    "startNewComponent") +
	    pcEntry(1, "else", "") +
	    pcEntry(2, "done &larr; true", "doneToTrue");
    }

    this.code += "</table>";
}

// graph traversals allow the option to find all components
hdxGraphTraversalsAV.supportFindAllComponents = true;


/* Dijkstra's algorithm based on hdxTraversalsSpanningAVCommon */

var hdxDijkstraAV = Object.create(hdxTraversalsSpanningAVCommon);

// entries for the list of AVs
hdxDijkstraAV.value = "dijkstra";
hdxDijkstraAV.name = "Dijkstra's Algorithm";
hdxDijkstraAV.description = "Dijkstra's algorithm for single-source shortest paths.";
hdxDijkstraAV.foundTableHeader = "Shortest Paths Found So Far";
hdxDijkstraAV.distEntry = "Distance";

// required function to create an appropriate list of discovered vertices
hdxDijkstraAV.createLDV = function() {
    
    return new HDXLinear(hdxLinearTypes.PRIORITY_QUEUE,
			 "Priority Queue");
};

// comparator for priority queue
hdxDijkstraAV.comparator = function(a, b) {
    return a.val < b.val;
};

// function to determine the next "val" field for a new LDV entry
// in this case, the old cumulative distance plus the edge length
//
// first parameter is the LDV entry being visited at this point,
// second parameter is the destination vertex and edge traversed
// to get from the vertex being visited
hdxDijkstraAV.valForLDVEntry = function(oldEntry, nextNeighbor) {

    return oldEntry.val + edgeLengthInMiles(graphEdges[nextNeighbor.via]);
};

// helper function to help build pseudocode
hdxDijkstraAV.mainLoopBody = function(indent) {

    return pcEntry(indent+1, "(to,via,d) &larr; pq." +
		   this.ldv.removeOperation() + "()", "getPlaceFromLDV") +
	pcEntry(indent+1, "if tree.contains(to)", "checkAdded") +
	pcEntry(indent+2, "discard (to,via) // on removal", "wasAdded") +
	pcEntry(indent+1, "else", "") +
	pcEntry(indent+2, "tree.add(to,via,d)", "wasNotAdded") +
	pcEntry(indent+2, "for each e=(to,v) // neighbors",
		"checkNeighborsLoopTop") +
	pcEntry(indent+3, "if tree.contains(v)", "checkNeighborsLoopIf") +
	pcEntry(indent+4, "discard (v,e) // on discovery",
		"checkNeighborsLoopIfTrue") +
	pcEntry(indent+3, "else", "") +
	pcEntry(indent+4, "pq." + this.ldv.addOperation() + "(v,e,d+len(e))", 
		"checkNeighborsLoopIfFalse");

};

// Dijkstra-specific psuedocode, note labels must match those
// expected by hdxTraversalsSpanningAVCommon avActions
hdxDijkstraAV.setupCode = function() {
    this.code = '<table class="pseudocode">' +
	pcEntry(0, ["pq &larr; new " + this.ldv.displayName,
		    "pq." + this.ldv.addOperation() + "(start,null,0)" ],
		"START");
    if (this.stoppingCondition == "StopAtEnd") {
	this.code +=
	    pcEntry(0, "while not tree.contains(end)", "checkEndAdded") +
	    pcEntry(1, "if pq.isEmpty", "checkLDVEmpty") +
	    pcEntry(2, "error: no path", "LDVEmpty") +
	    this.mainLoopBody(0);
    }
    else if (this.stoppingCondition == "FindReachable") {
	this.code +=
	    pcEntry(0, "while not pq.isEmpty", "checkComponentDone") +
	    this.mainLoopBody(0);

    }

    this.code += "</table>";
};

/* Prim's algorithm based on hdxTraversalsSpanningAVCommon */

var hdxPrimAV = Object.create(hdxTraversalsSpanningAVCommon);

// entries for the list of AVs
hdxPrimAV.value = "prim";
hdxPrimAV.name = "Prim's Algorithm";
hdxPrimAV.description = "Prim's algorithm for minimum cost spanning trees.";
hdxPrimAV.foundTableHeader = "Edges in Spanning Tree/Forest";
hdxPrimAV.distEntry = "Length";

// required function to create an appropriate list of discovered vertices
hdxPrimAV.createLDV = function() {
    
    return new HDXLinear(hdxLinearTypes.PRIORITY_QUEUE,
			 "Priority Queue");
};

// comparator for priority queue
hdxPrimAV.comparator = function(a, b) {
    return a.val < b.val;
};

// function to determine the next "val" field for a new LDV entry
// in this case, the edge length
//
// first parameter is the LDV entry being visited at this point,
// second parameter is the destination vertex and edge traversed
// to get from the vertex being visited
hdxPrimAV.valForLDVEntry = function(oldEntry, nextNeighbor) {

    return edgeLengthInMiles(graphEdges[nextNeighbor.via]);
}

// helper function to help build pseudocode
hdxPrimAV.mainLoopBody = function(indent) {

    return pcEntry(indent+1, "(to,via,d) &larr; pq." +
		   this.ldv.removeOperation() + "()", "getPlaceFromLDV") +
	pcEntry(indent+1, "if tree.contains(to)", "checkAdded") +
	pcEntry(indent+2, "discard (to,via) // on removal", "wasAdded") +
	pcEntry(indent+1, "else", "") +
	pcEntry(indent+2, "tree.add(to,via,d)", "wasNotAdded") +
	pcEntry(indent+2, "for each e=(to,v) // neighbors",
		"checkNeighborsLoopTop") +
	pcEntry(indent+3, "if tree.contains(v)", "checkNeighborsLoopIf") +
	pcEntry(indent+4, "discard (v,e) // on discovery",
		"checkNeighborsLoopIfTrue") +
	pcEntry(indent+3, "else", "") +
	pcEntry(indent+4, "pq." + this.ldv.addOperation() + "(v,e,len(e))", 
		"checkNeighborsLoopIfFalse");

};

// Prim's-specific psuedocode, note labels must match those
// expected by hdxTraversalsSpanningAVCommon avActions
hdxPrimAV.setupCode = function() {
    this.code = '<table class="pseudocode">' +
	pcEntry(0, ["pq &larr; new " + this.ldv.displayName,
		    "pq." + this.ldv.addOperation() + "(start,null,0)" ],
		"START");
    if (this.stoppingCondition == "StopAtEnd") {
	this.code +=
	    pcEntry(0, "while not tree.contains(end)", "checkEndAdded") +
	    pcEntry(1, "if pq.isEmpty", "checkLDVEmpty") +
	    pcEntry(2, "error: no path", "LDVEmpty") +
	    this.mainLoopBody(0);
    }
    else if (this.stoppingCondition == "FindReachable") {
	this.code +=
	    pcEntry(0, "while not pq.isEmpty", "checkComponentDone") +
	    this.mainLoopBody(0);

    }
    else { // this.stoppingCondition == "FindAll"
	this.code +=
	    pcEntry(0, "while not done", "checkAllComponentsDone") +
	    pcEntry(1, "while not pq.isEmpty", "checkComponentDone") +
	    this.mainLoopBody(1) +
	    pcEntry(1, "// finalize component", "finalizeComponent") +
	    pcEntry(1, "if &exist; any unadded vertices", "checkAnyUnadded") +
	    pcEntry(2, [ "v &larr; any unadded vertex",
			 "pq." + this.ldv.addOperation() + "(v,null)" ],
		    "startNewComponent") +
	    pcEntry(1, "else", "") +
	    pcEntry(2, "done &larr; true", "doneToTrue");
    }

    this.code += "</table>";
};

// Prim's allows the option to find all components
hdxPrimAV.supportFindAllComponents = true;

// get a list of adjacent vertices by index into waypoints array
function getAdjacentPoints(pointIndex) {
    var resultArray = [];
    var edgeList = waypoints[pointIndex].edgeList;
    for (var i = 0; i < edgeList.length; i++) {
        var adjacentIndex;
        if (edgeList[i].v1 == pointIndex) {
            adjacentIndex = edgeList[i].v2;
        }
	else {
            adjacentIndex = edgeList[i].v1;
        }
        resultArray.push(adjacentIndex);
    }
    
    return resultArray;
}

// Brute-force convex hull AV
// based on original code by Arjol Pengu and Maria Bamundo
var hdxBFConvexHullAV = {

    // entries for list of AVs
    value: "bfhull",
    name: "Brute-Force Convex Hull",
    description: "Compute the convex hull of the waypoints using the brute-force algorithm.",
    
    // pseudocode
    code:'<table class="pseudocode">' +
	pcEntry(0, "hull &larr; new list", "START") +
	pcEntry(0, "for (v<sub>1</sub> &larr; 0 to |V|-2)", "v1forLoopTop") +
	pcEntry(1, "for (v<sub>2</sub> &larr; v<sub>1</sub> to |V|-1)", "v2forLoopTop") +
	pcEntry(2, [ "// find line through V[v<sub>1</sub>] and V[v<sub>2</sub>]",
		     "a &larr; V[v<sub>2</sub>].lat - V[v<sub>1</sub>].lat",
		     "b &larr; V[v<sub>1</sub>].lon - V[v<sub>2</sub>].lon",
		     "c &larr; V[v<sub>1</sub>].lon*V[v<sub>2</sub>].lat - V[v<sub>1</sub>].lat*V[v<sub>2</sub>].lon",
		     "eliminated &larr; false",
		     "lookingFor &larr; UNKNOWN" ],
		"calculateLine") +
	pcEntry(2, "for (v<sub>test</sub> &larr; 0 to |V|-1), skip v<sub>1</sub>, v<sub>2</sub>", "vtestforLoopTop") +
	pcEntry(3, "checkVal &larr; a*V[v<sub>test</sub>].lon + b*V[v<sub>test</sub>].lat - c",
		"computeCheckVal") +
	pcEntry(3, "if checkVal = 0", "isCheckVal0") +
	pcEntry(4, "if V[v<sub>test</sub>] not between V[v<sub>1</sub>] and V[v<sub>2</sub>]", "checkBetween") +
	pcEntry(5, "eliminated &larr; true; break", "isColinearNotBetween") +
	pcEntry(3, "else", "") +
	pcEntry(4, "if lookingFor = UNKNOWN", "checkFirst") +
	pcEntry(5, "if checkVal < 0", "isCheckValNegative") +
	pcEntry(6, "lookingFor &larr; NEGATIVE", "setNegative") +
	pcEntry(5, "else if checkVal > 0", "isCheckValPositive") +
	pcEntry(6, "lookingFor &larr; POSITIVE", "setPositive") +
	pcEntry(4, "else", "") +
	pcEntry(5, "if lookingFor = POSITIVE and checkVal < 0 or lookingFor = NEGATIVE and checkVal > 0",
		"checkSameSide") +
	pcEntry(6, "eliminated &larr; true; break", "notSameSide") +
	pcEntry(3, "if not eliminated", "checkEliminated") +
	pcEntry(4, "hull.add(V[v<sub>1</sub>],V[v<sub>2</sub>])", "addToHull") +
	'</table>',

    // the list of points in the convex hull being computed
    hullPoints: [],

    // the list of Polylines that make up the hull so far
    hullSegments: [],

    // the list of segments by endpoints that make up the hull
    hullSegmentEndpoints: [],

    // the v1, v2, and btest loop indices for our deconstructed nested loop
    hullv1: 0,
    hullv1: 0,
    hullvtest: 0,
    
    convexLineHull: [],
    visitingLine: [],
    currentSegment: null,

    // coeffients for equation of the line connecting pairs of points
    a: 0,
    b: 0,
    c: 0,

    // algorithm statistics
    segmentsConsidered: 0,
    checkValThisSegment: 0,
    checkValComputations: 0,

    // additional variables needed for search to determine if a
    // segment is part of the hull
    eliminated: false,
    lookingFor: "UNKNOWN",
    
    visualSettings: {
        hullv1: {
            color: "Gold",
            textColor: "black",
            scale: 6,
	    name: "hullv1",
	    value: 0
	},
        hullv2: {
            color: "Goldenrod",
            textColor: "black",
            scale: 6,
	    name: "hullv2",
	    value: 0
	},
        hullvtest: visualSettings.visiting,
	discardedv2: {
	    color: "green",
	    textColor: "black",
	    scale: 2,
	    name: "discardedv2",
	    value: 0
	},
	checkedPositive: {
	    color: "green",
	    textColor: "white",
	    scale: 6,
	    name: "checkedPositive",
	    value: 0
	},
	checkedNegative: {
	    color: "purple",
	    textColor: "white",
	    scale: 6,
	    name: "checkedNegative",
	    value: 0
	},
	mismatch: {
	    color: "red",
	    textColor: "white",
	    scale: 6,
	    name: "mismatch",
	    value: 0
	},
	hullComponent: visualSettings.spanningTree
    },

    // helper function to draw and set the current segment, i to j
    mapCurrentSegment() {

	let visitingLine = [];
	visitingLine[0] = [waypoints[this.hullv1].lat, waypoints[this.hullv1].lon];
	visitingLine[1] = [waypoints[this.hullv2].lat, waypoints[this.hullv2].lon];
	this.currentSegment = L.polyline(visitingLine, {
	    color: visualSettings.visiting.color,
	    opacity: 0.6,
	    weight: 4
	});
	this.currentSegment.addTo(map);
    },

    currentSegmentString() {

	return "segment connecting #" + this.hullv1 + " and #" +
	    this.hullv2;
    },

    // update the stats panel entry with latest counts
    updateStatsEntry() {

	let avg = (this.checkValComputations*1.0/this.segmentsConsidered).toFixed(1);
	updateAVControlEntry("stats",
			     "Considered " + this.segmentsConsidered +
			     " segments<br />Checked " +
			     this.checkValComputations +
			     " points, average of " + avg + " per segment");
	let segCheck = document.getElementById("segmentCheckValCount");
	if (this.checkValThisSegment == 1) {
	    segCheck.innerHTML = "Checked 1 point";
	}
	else {
	    segCheck.innerHTML = "Checked " + this.checkValThisSegment + " points";
	}
    },

    // format a table row with waypoint i for the display of entries
    // at the end
    hullTableRow(i) {

	return '<tr><td>' + i + '</td><td>' + waypoints[i].label +
	    '</td><td>(' + waypoints[i].lat + ',' + waypoints[i].lon +
	    ')</td></tr>';
    },

    // the actions that make up the brute-force convex hull
    avActions: [
	{
	    label: "START",
	    comment: "initialize brute-force convex hull variables",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);
		
		updateAVControlEntry("hullsegments", "No hull segments found yet");
		updateAVControlEntry("stats", "No segments considered yet");


		hdxAV.iterationDone = true;
		thisAV.hullv1 = -1;  // will increment to 0
		thisAV.segmentsConsidered = 0;
		thisAV.checkValComputations = 0;
		thisAV.hullSegments = [];
		thisAV.hullSegmentEndpoints = [];
		thisAV.hullPoints = [];
		
		hdxAV.nextAction = "v1forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Initializing brute-force convex hull variables";
	    }
	},
	{
	    label: "v1forLoopTop",
	    comment: "v1 loop, outer loop to visit all pairs",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullv1);
		thisAV.hullv1++;
		if (thisAV.hullv1 == waypoints.length-1) {
		    hdxAV.nextAction = "cleanup";
		}
		else {
		    hdxAV.nextAction = "v2forLoopTop";
		    thisAV.hullv2 = thisAV.hullv1;  // will increment to +1
		    updateMarkerAndTable(thisAV.hullv1, thisAV.visualSettings.hullv1,
					 30, false);
		    updateAVControlEntry("hullv1", "v<sub>1</sub>: #" + thisAV.hullv1 + " " + waypoints[thisAV.hullv1].label);

		}
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Top of outer for loop over vertices, v<sub>1</sub>=" + thisAV.hullv1;
	    }
	},
	{
	    label: "v2forLoopTop",
	    comment: "v2 loop, inner loop to visit all pairs",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullv2);
		thisAV.hullv2++;
		if (thisAV.hullv2 == waypoints.length) {
		    hdxAV.nextAction = "v1forLoopTop";
		}
		else {
		    hdxAV.nextAction = "calculateLine";
		    // make sure v1 is still highlighted appropriately
		    updateMarkerAndTable(thisAV.hullv1,
					 thisAV.visualSettings.hullv1,
					 30, false);
		    updateMarkerAndTable(thisAV.hullv2,
					 thisAV.visualSettings.hullv2,
					 30, false);
		    updateAVControlEntry("hullv2", "v<sub>2</sub>: #" + thisAV.hullv2 + " " + waypoints[thisAV.hullv2].label);
		    thisAV.mapCurrentSegment();
		}

		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Top of inner for loop over vertices, v<sub>2</sub>=" + thisAV.hullv2;
	    }
	},
	{
	    label: "calculateLine",
	    comment: "Calculate the equation of the line between v1 and v2",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);
		let pointv1 = waypoints[thisAV.hullv1];
		let pointv2 = waypoints[thisAV.hullv2];
    
		// compute the coefficients for ax + by = c
		// of the line connecting v1 and v2
		thisAV.a = pointv2.lat - pointv1.lat;
		thisAV.b = pointv1.lon - pointv2.lon;
		thisAV.c = pointv1.lon * pointv2.lat - pointv1.lat * pointv2.lon;
		
		updateAVControlEntry("checkingLine",
				     "Considering line: " +
				     thisAV.a.toFixed(3) + "*lat + " +
				     thisAV.b.toFixed(3) + "*lng = " +
				     thisAV.c.toFixed(3) +
				    '<br /><span id="segmentCheckValCount">Checked 0 points</span>');

		// record this segment being checked
		thisAV.segmentsConsidered++;
		thisAV.checkValThisSegment = 0;
		thisAV.updateStatsEntry();
		
		// additional search variables to help determine if
		// this pair is part of the hull
		thisAV.eliminated = false;
		thisAV.lookingFor = "UNKNOWN";

		// set up for innermost loop
		thisAV.hullvtest = -1;  // will increment to 0 to start

		// mark all as unvisited except v1 and v2
		for (var i = 0; i < waypoints.length; i++) {
		    if (i != thisAV.hullv1 && i != thisAV.hullv2) {
			updateMarkerAndTable(i, visualSettings.undiscovered);
		    }
		}
		
		hdxAV.nextAction = "vtestforLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Computed coefficients of " +
		    thisAV.currentSegmentString();
	    }
	},
	{
	    label: "vtestforLoopTop",
	    comment: "Top of loop over all vertices to check if the given segment is in the hull",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		thisAV.hullvtest++;
		// skip v1, v2
		while (thisAV.hullvtest == thisAV.hullv1 ||
		       thisAV.hullvtest == thisAV.hullv2) {
		    thisAV.hullvtest++;
		}
		if (thisAV.hullvtest == waypoints.length) {
		    hdxAV.nextAction = "checkEliminated";
		}
		else {
		    hdxAV.nextAction = "computeCheckVal";
		    updateMarkerAndTable(thisAV.hullvtest,
					 thisAV.visualSettings.hullvtest,
					 30, false);
		    updateAVControlEntry("hullvtest", "v<sub>test</sub>: #" + thisAV.hullvtest + " " + waypoints[thisAV.hullvtest].label);
		
		}
	    },
	    logMessage: function(thisAV) {
		return "Top of loop over vertices testing " +
		    thisAV.currentSegmentString();
	    }
	},
	{
	    label: "computeCheckVal",
	    comment: "Plug vertex into the equation of the candidate segment",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		let pointvtest = waypoints[thisAV.hullvtest];
		thisAV.checkVal = thisAV.a * pointvtest.lon +
		    thisAV.b * pointvtest.lat - thisAV.c;

		// count this checkVal computation
		thisAV.checkValComputations++;
		thisAV.checkValThisSegment++;
		thisAV.updateStatsEntry();
		
		hdxAV.nextAction = "isCheckVal0";
	    },
	    logMessage: function(thisAV) {
		return "Computed checkVal = " + thisAV.checkVal.toFixed(3);
	    }
	},
	{
	    label: "isCheckVal0",
	    comment: "Test for checkVal=0",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		if (thisAV.checkVal == 0) {
		    hdxAV.nextAction = "checkBetween";
		}
		else {
		    hdxAV.nextAction = "checkFirst";
		}
	    },
	    logMessage: function(thisAV) {
		return "Checking if checkVal=" +
		    thisAV.checkVal.toFixed(3) + " is 0";
	    }
	},
	{
	    label: "checkBetween",
	    comment: "checkVal is 0, checking if colinear point is between candidate segment endpoints",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		if (isBetween(waypoints[thisAV.hullv1],
			      waypoints[thisAV.hullv2],
			      waypoints[thisAV.hullvtest])) {
		    hdxAV.nextAction = "checkFirst";
		}
		else {
		    hdxAV.nextAction = "isColinearNotBetween";
		}
	    },
	    logMessage: function(thisAV) {
		return "Checking if colinear point is on " +
		    thisAV.currentSegmentString();
	    }
	},
	{
	    label: "isColinearNotBetween",
	    comment: "point is colinear but not between, so eliminate the segment",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		thisAV.eliminated = true;
		hdxAV.nextAction = "checkEliminated";
	    },
	    logMessage: function(thisAV) {
		return "Eliminating " + thisAV.currentSegmentString() +
		    " because of colinear point between";
	    }
	},
	{
	    label: "checkFirst",
	    comment: "checking if we are doing the first point for the segment",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		if (thisAV.lookingFor == "UNKNOWN") {
		    hdxAV.nextAction = "isCheckValNegative";
		}
		else {
		    hdxAV.nextAction = "checkSameSide";
		}
	    },
	    logMessage: function(thisAV) {
		return "checking if we are doing the first point for the segment";
	    }
	},
	{
	    label: "isCheckValNegative",
	    comment: "test for a negative initial checkVal",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		if (thisAV.checkVal < 0) {
		    hdxAV.nextAction = "setNegative";
		}
		else {
		    hdxAV.nextAction = "isCheckValPositive";
		}
	    },
	    logMessage: function(thisAV) {
		return "Testing if checkVal=" + thisAV.checkVal +
		    " is negative";
	    }
	},
	{
	    label: "setNegative",
	    comment: "set the lookingFor variable to indicate that the first checkVal was negative",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.checkedNegative);
		thisAV.lookingFor = "NEGATIVE";
		updateMarkerAndTable(thisAV.hullvtest,
				     thisAV.visualSettings.checkedNegative,
				     20, false);
		hdxAV.nextAction = "vtestforLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Setting to look for all negative checkVal values";
	    }
	},
	{
	    label: "isCheckValPositive",
	    comment: "test for a positive initial checkVal",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		if (thisAV.checkVal > 0) {
		    hdxAV.nextAction = "setPositive";
		}
		else {
		    hdxAV.nextAction = "vtestforLoopTop";
		}
	    },
	    logMessage: function(thisAV) {
		return "Testing if checkVal=" + thisAV.checkVal +
		    " is positive";
	    }
	},
	{
	    label: "setPositive",
	    comment: "set the lookingFor variable to indicate that the first checkVal was positive",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.checkedPositive);
		thisAV.lookingFor = "POSITIVE";
		updateMarkerAndTable(thisAV.hullvtest,
				     thisAV.visualSettings.checkedPositive,
				     20, false);
		hdxAV.nextAction = "vtestforLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Setting to look for all negative checkVal values";
	    }
	},
	{
	    label: "checkSameSide",
	    comment: "check if the current point is on the same side of the candidate segment as all previous",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullvtest);
		if ((thisAV.lookingFor == "POSITIVE" &&
		     thisAV.checkVal < 0) ||
		    (thisAV.lookingFor == "NEGATIVE" &&
		     thisAV.checkVal > 0)) {
		    updateMarkerAndTable(thisAV.hullvtest,
					 thisAV.visualSettings.mismatch,
					 20, false);
		    hdxAV.nextAction = "notSameSide";
		}
		else {
		    // draw as the positive or negative color
		    if (thisAV.checkVal < 0) {
			updateMarkerAndTable(thisAV.hullvtest,
					     thisAV.visualSettings.checkedNegative,
					     20, false);
		    }
		    else {
			updateMarkerAndTable(thisAV.hullvtest,
					     thisAV.visualSettings.checkedPositive,
					     20, false);
		    }
		    hdxAV.nextAction = "vtestforLoopTop";
		}
	    },
	    logMessage: function(thisAV) {
		return "Checking if " + thisAV.hullvtest +
		    " is on the same side as previously checked points";
	    }
	},
	{
	    label: "notSameSide",
	    comment: "found a point on the opposite side of the line segment",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.mismatch);

		thisAV.eliminated = true;
		hdxAV.nextAction = "checkEliminated";
	    },
	    logMessage: function(thisAV) {
		return "Point #" + thisAV.hullvtest +
		    "is on the opposite side as previous point, discarding segment";
	    }
	},
	{
	    label: "checkEliminated",
	    comment: "end of loop over all checks for this candidate segment",
	    code: function(thisAV) {
		highlightPseudocode(this.label, visualSettings.visiting);

		// restore coloring
		// mark all as unvisited except v1 and v2
		for (var i = 0; i < waypoints.length; i++) {
		    updateMarkerAndTable(i, visualSettings.undiscovered);
		}
		// restore coloring of hull segment endpoints
		for (var i = 0; i < thisAV.hullPoints.length; i++) {
		    updateMarkerAndTable(thisAV.hullPoints[i],
					 thisAV.visualSettings.hullComponent);
		}

		if (thisAV.eliminated) {
		    // remove the current segment from the map
		    thisAV.currentSegment.remove();
		    hdxAV.nextAction = "v2forLoopTop";
		}
		else {
		    hdxAV.nextAction = "addToHull";
		}
	    },
	    logMessage: function(thisAV) {
		return "Checking if " + thisAV.currentSegmentString() +
		    " has been eliminated after " +
		    thisAV.checkValThisSegment + " points";
	    }
	},
	{
	    label: "addToHull",
	    comment: "add current segment to the convex hull",
	    code: function(thisAV) {
		highlightPseudocode(this.label, thisAV.visualSettings.hullComponent);
		// add to hull
		if (!thisAV.hullPoints.includes(thisAV.hullv1)) {
		    updateMarkerAndTable(thisAV.hullv1,
					 thisAV.visualSettings.hullComponent,
					 20, false);
		    thisAV.hullPoints.push(thisAV.hullv1);
		}
		if (!thisAV.hullPoints.includes(thisAV.hullv2)) {
		    updateMarkerAndTable(thisAV.hullv2,
					 thisAV.visualSettings.hullComponent,
					 20, false);
		    thisAV.hullPoints.push(thisAV.hullv2);
		}

		// color current segment and remember as part of the hull
		thisAV.hullSegmentEndpoints.push([thisAV.hullv1,
						  thisAV.hullv2]);
		thisAV.hullSegments.push(thisAV.currentSegment);
		thisAV.currentSegment.setStyle({
		    color: thisAV.visualSettings.hullComponent.color
		});
		updateAVControlEntry("hullsegments",
				     thisAV.hullSegments.length +
				     " hull segments found");
		hdxAV.nextAction = "v2forLoopTop";
	    },
	    logMessage: function(thisAV) {
		return "Added " + thisAV.currentSegmentString() +
		    " to hull";
	    }
	},
	{
	    label: "cleanup",
	    comment: "Clean up and finalize visualization",
	    code: function(thisAV) {

		updateAVControlEntry("hullv1", "");
		updateAVControlEntry("hullv2", "");
		updateAVControlEntry("hullvtest", "");
		updateAVControlEntry("checkingLine", "");

		// build table of points in order along the hull
		let table = '<table class="gratable"><thead>' +
		    '<tr style="text-align:center"><th>#</th><th>Label</th><th>Coordinates</th></tr></thead><tbody>';

		// grab the two endpoints from the last segment that
		// was added to get started
		let lastSegment = thisAV.hullSegmentEndpoints.pop();
		table += thisAV.hullTableRow(lastSegment[0]) +
		    thisAV.hullTableRow(lastSegment[1]);
		let connectTo = lastSegment[1];
		
		// now search for ones connected around the loop
		while (thisAV.hullSegmentEndpoints.length > 0) {
		    for (let i = thisAV.hullSegmentEndpoints.length-1;
			 i >= 0; i--) {
			let segment = thisAV.hullSegmentEndpoints[i];
			if (segment[0] == connectTo) {
			    // we want to add segment[1]
			    table += thisAV.hullTableRow(segment[1]);
			    connectTo = segment[1];
			    thisAV.hullSegmentEndpoints.splice(i, 1);
			}
			else if (segment[1] == connectTo) {
			    // we want to add segment[0]
			    table += thisAV.hullTableRow(segment[0]);
			    connectTo = segment[0];
			    thisAV.hullSegmentEndpoints.splice(i, 1);
			}
		    }
		}

		table += '</tbody></table>';
		updateAVControlEntry("hullsegments",
				     thisAV.hullSegments.length +
				     " hull segments found<br />" +
				    table);

		hdxAV.nextAction = "DONE";
		hdxAV.iterationDone = true;
	    },
	    logMessage: function(thisAV) {
		return "Clean up and finalize visualization";
	    }
	},
    ],

    // required prepToStart method for brute force convex hull
    prepToStart() {

	hdxAV.algStat.innerHTML = "Initializing";

	// show waypoints, hide connections
	initWaypointsAndConnections(true, false,
				    visualSettings.undiscovered);
    },

    // set up UI for convex hull
    setupUI() {
	
	//if (waypoints.length > 100) {
	//    alert("This is an O(n^3) algorithm in the worst case, so you might wish to choose a smaller graph.");
	//}
	hdxAV.algStat.style.display = "";
	hdxAV.algStat.innerHTML = "Setting up";
        hdxAV.algOptions.innerHTML = '';
	addEntryToAVControlPanel("hullsegments", this.visualSettings.hullComponent);
	addEntryToAVControlPanel("stats", visualSettings.pseudocodeDefault);
	addEntryToAVControlPanel("hullv1", this.visualSettings.hullv1);
	addEntryToAVControlPanel("hullv2", this.visualSettings.hullv2);
	addEntryToAVControlPanel("hullvtest", this.visualSettings.hullvtest);
	addEntryToAVControlPanel("checkingLine", visualSettings.visiting);
    },

    // clean up convex hull UI
    cleanupUI() {

	for (var i = 0; i < this.hullSegments.length; i++) {
	    this.hullSegments[i].remove();
	}
    }
};

/**
    Check if this point is directly in between the two given
    points.  Note: the assumption is that they are colinear.

    @param o1 one of the points
    @param o2 the other point
    @return whether this point is between the two given points
    */

function isBetween(o1, o2, o3) {
    var sqDisto1o2 = squaredDistance(o1,o2);
    //alert("isBetween" + (squaredDistance(o3,o2) < sqDisto1o2) &&
    //      (squaredDistance(o3,o2) < sqDisto1o2));
    return (squaredDistance(o3,o2) < sqDisto1o2) &&
        (squaredDistance(o3,o2) < sqDisto1o2);
}

// Creates the TOSLabels for the different map tiles and appends them
// to a div which is returned
function TOSLabel() {
    var menubar = document.querySelector(".menubar");
    
    var label = document.createElement("a");
    label.setAttribute("id", "ReferenceLink");
    label.setAttribute("href", "http://travelmapping.net/credits.php");
    label.setAttribute("target", "_blank");
    label.innerHTML = "Credits and Sources";
    
    return label;
}


/*
  Linear structure that can be displayed in a collapsed form
*/
var hdxLinearTypes = {

    // constants to refer to these, if new ones are added,
    // place before UNKNOWN and increment UNKNOWN's value
    STACK: 1,
    QUEUE: 2,
    RANDOM: 3,
    PRIORITY_QUEUE:4,
    UNKNOWN: 5
};

// to generate unique document element ids
var HDXLinearCounter = 1;

function HDXLinear(type, displayName) {

    // supported types listed above
    if (type < hdxLinearTypes.STACK || type >= hdxLinearTypes.UNKNOWN) {
	console.log("Invalid type of HDXLinear!");
    }
    this.type = type;
    this.displayName = displayName;
    this.idNum = HDXLinearCounter;
    this.maxLabelLength = 10;
    this.valPrecision = 3;
    HDXLinearCounter++;

    // the actual array representing this linear structure
    this.items = [];

    // some stats about it
    this.addCount = 0;
    this.removeCount = 0;

    // the document element in which to display the contents
    this.docElement = null;

    // the callback to use to get the actual text to
    // display for each displayed element
    this.elementHTMLCallback = null;

    // default comparator function for priority queues
    this.comesBefore = function(a, b) {

	return a < b;
    };

    // set custom comparator for priority queues
    this.setComparator = function(c) {

	this.comesBefore = c;
    };
    
    // set the element and callback
    this.setDisplay = function(dE, eC) {

	this.docElement = dE;
	this.elementHTMLCallback = eC;
	let t = this.displayName + ' (size <span id="HDXLinear' +
	    this.idNum + 'Span">'+ this.items.length +
	    '</span>)&nbsp;&nbsp;&nbsp;<input id="HDXLinear' +
	    this.idNum + 'Limit" type="checkbox" checked /> ' +
	    ' limit display to <input id="HDXLinear' + this.idNum +
	    'LimitVal" type="number" value="10" min="1" max="1000000" ' +
	    'size="3" style="width: 3em" /> entries' +
	    '<br /><table><tbody id="HDXLinear' + this.idNum + 'TBody">' +
	    '</tbody></table>';
	this.docElement.innerHTML = t;
	this.lengthSpan = document.getElementById("HDXLinear" + this.idNum + "Span");
	this.tbody = document.getElementById("HDXLinear" + this.idNum + "TBody");
	this.limitCheck = document.getElementById("HDXLinear" + this.idNum + "Limit");
	this.limit = document.getElementById("HDXLinear" + this.idNum + "LimitVal");
	this.redraw();
    };
    
    // add a item to this linear structure
    this.add = function(e) {

	if ((this.type == hdxLinearTypes.PRIORITY_QUEUE) &&
	    this.items.length > 0) {
	    // need to maintain in order
	    // does e come first?
	    let i = 0;
	    while ((i < this.items.length) &&
		   this.comesBefore(e, this.items[i])) {
		i++;
	    }
	    this.items.splice(i, 0, e);
	}
	else {
	    this.items.push(e);
	}
	this.addCount++;
	
	this.redraw();
    };

    // remove next based on type
    this.remove = function() {

	this.removeCount++;
	let retval = null;
	switch(this.type) {

	case hdxLinearTypes.STACK:
	case hdxLinearTypes.PRIORITY_QUEUE:
	    retval = this.items.pop();
	    break;
	    
	case hdxLinearTypes.QUEUE:
	    retval = this.items.shift();
	    break;
	    
	case hdxLinearTypes.RANDOM:
            let index = Math.floor(Math.random() * this.items.length);
            retval = this.items[index];
            this.items.splice(index, 1);
	    break;
	}

	this.redraw();
	return retval;
    };
    
    // search for an entry with the given field having the given value
    this.containsFieldMatching = function(field, value) {

	for (var i = 0; i < this.items.length; i++) {
	    if (this.items[i][field] == value) {
		return true;
	    }
	}
	return false;
    };

    // check for empty list
    this.isEmpty = function() {

	return this.items.length == 0;
    };

    // redraw in the HTML element
    this.redraw = function() {

	if (this.docElement != null) {
	    this.lengthSpan.innerHTML = this.items.length;
	    let t = "<tr>";
	    let maxDisplay = Number.MAX_VALUE;
	    if (this.limitCheck.checked) {
		maxDisplay = this.limit.value;
	    }
	    if (maxDisplay >= this.items.length) {
		for (var i = 0; i < this.items.length; i++) {
		    t += "<td>" + this.elementHTMLCallback(this.items[i], this) + "</td>";
		}
	    }
	    else {
		// we have to limit: with stacks and randoms, we
		// ignore the initial entries
		if (this.type == hdxLinearTypes.STACK ||
		    this.type == hdxLinearTypes.RANDOM) {
		    // first a placeholder entry
		    t += "<td>...</td>";
		    for (var i = this.items.length - maxDisplay;
			 i < this.items.length; i++) {
			t += "<td>" + this.elementHTMLCallback(this.items[i], this) + "</td>";
		    }
		}
		// queues will ignore the middle
		else if ((this.type == hdxLinearTypes.QUEUE) ||
			 (this.type == hdxLinearTypes.PRIORITY_QUEUE)) {
		    // half of the displayable elements from the front
		    let firstChunk = Math.floor(maxDisplay / 2);
		    for (var i = 0; i < firstChunk; i++) {
			t += "<td>" + this.elementHTMLCallback(this.items[i], this) + "</td>";
		    }
		    // next a placeholder entry
		    t += "<td>...</td>";
		    // half of the displayable elements from the end
		    for (var i = this.items.length -
			     (maxDisplay - firstChunk);
			 i < this.items.length; i++) {
			t += "<td>" + this.elementHTMLCallback(this.items[i], this) + "</td>";
		    }
		}
	    }
	    t += "</tr>";
	    this.tbody.innerHTML = t;
	}
    };

    // names to use when referring to add and remove operations
    this.addOperation = function() {
	switch(this.type) {

	case hdxLinearTypes.STACK:
	    return "push";
	case hdxLinearTypes.PRIORITY_QUEUE:
	case hdxLinearTypes.RANDOM:
	    return "add";
	case hdxLinearTypes.QUEUE:
	    return "enqueue";
	}
    };

    this.removeOperation = function() {
	switch(this.type) {

	case hdxLinearTypes.STACK:
	    return "pop";
	case hdxLinearTypes.PRIORITY_QUEUE:
	case hdxLinearTypes.RANDOM:
	    return "remove";
	case hdxLinearTypes.QUEUE:
	    return "dequeue";
	}
    };
    
    return this;
}

/* object to display the value of a variable (which should be
   a number or string) with a given label and in the given
   document element's innerHTML, beginning with the given
   initial value */
function HDXDisplayVariable(displayLabel,docElement,initVal) {

    this.value = initVal;
    this.label = displayLabel;
    this.docElement = docElement;

    // set to a new value
    this.set = function(newVal) {
	
	this.value = newVal;
	this.paint();
    };

    // increment
    this.increment = function() {

	this.value++;
	this.paint();
    };
    
    // redraw in the document element
    this.paint = function() {

	this.docElement.innerHTML = this.label + this.value;
    };

    this.paint();
    return this;
}

// loadfromqs used to be part of loadmap, likely to be replaced with
// code generated by PHP later
function loadfromqs() {
    
    // check for a load query string parameter
    var qs = location.search.substring(1);
    //DBG.write("qs: " + qs);
    var qsitems = qs.split('&');
    for (var i = 0; i < qsitems.length; i++) {
	//DBG.write("qsitems[" + i + "] = " + qsitems[i]);
	var qsitem = qsitems[i].split('=');
	//DBG.write("qsitem[0] = " + qsitem[0]);
	if (qsitem[0] == "load") {
	    var request = new XMLHttpRequest();
	    //DBG.write("qsitem[1] = " + qsitem[1]);
	    document.getElementById('filename').innerHTML = qsitem[1];
	    request.open("GET", qsitem[1], false);
	    request.setRequestHeader("User-Agent", navigator.userAgent);
	    request.send(null);
	    if (request.status == 200) {
		processContents(request.responseText);
	    }
	}
    }
}

// shortcut function to display errors
function pointboxErrorMsg(msg) {
    pointbox = document.getElementById("pointbox");
    selected = document.getElementById("selected");
    
    pointbox.innerHTML = "<table class=\"gratable\"><thead><tr><th style=\"color: red\">" + msg + "</th></thead></table>";
    selected.innerHTML = pointbox.innerHTML;
    
}

// when a file is selected, this will be called
function startRead() {

    // first, retrieve the selected file (as a File object)
    // which must be done before we toggle the table to force
    // the pointbox to be displayed
    var file = document.getElementById('filesel').files[0];
    
    // force data table to be displayed
    let datatable = document.getElementById("datatable");
    datatable.style.display = "";
    let checkbox = document.getElementById("datatablesCheckbox");
    checkbox.selected = true;

    if (file) {
	//DBG.write("file: " + file.name);
	document.getElementById('filename').innerHTML = file.name;
	if ((file.name.indexOf(".wpt") == -1) &&
	    (file.name.indexOf(".pth") == -1) &&
	    (file.name.indexOf(".nmp") == -1) &&
	    (file.name.indexOf(".gra") == -1) &&
	    (file.name.indexOf(".tmg") == -1) &&
	    (file.name.indexOf(".wpl") == -1)) {
	    pointboxErrorMsg("Unrecognized file type!");
	    return;
	}
	if (file.name.includes("OCE-continent")) {
	    alert("This graph cannot be used with the Convex Hull algorithm as currently implemented, as it spans the international date line.");
	}
	// pointboxErrorMsg("Loading... (" + file.size + " bytes)");
	var reader;
	try {
	    reader = new FileReader();
	}
	catch(e) {
	    pointboxErrorMsg("Error: unable to access file (Perhaps no browser support?  Try recent Firefox or Chrome releases.).");
	    return;
	}
	reader.readAsText(file, "UTF-8");
	reader.onload = fileLoaded;
	//reader.onerror = fileLoadError;
    }
}

function readServer(event) {

    var index = document.getElementById("graphList").selectedIndex;
    var value = document.getElementById("graphList").options[index].value;
    
    if (value != "") {
 	// document.getElementById("test").innerHTML = value;
 	
 	var xmlhttp = new XMLHttpRequest();
 	xmlhttp.onreadystatechange = function() {
 	    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
 		
 		var file = new Blob([xmlhttp.responseText], {type : "text/plain"});
 		file.name = value;
 		
 		if (file) {
 		    //DBG.write("file: " + file.name);
 		    document.getElementById('filename').innerHTML = file.name;
 		    if ((file.name.indexOf(".wpt") == -1) &&
 			(file.name.indexOf(".pth") == -1) &&
 			(file.name.indexOf(".nmp") == -1) &&
 			(file.name.indexOf(".gra") == -1) &&
 			(file.name.indexOf(".tmg") == -1) &&
 			(file.name.indexOf(".wpl") == -1)) {
 			pointboxErrorMsg("Unrecognized file type!");
 			return;
 		    }
 		    // pointboxErrorMsg("Loading... (" + file.size + " bytes)");
 		    var reader;
 		    try {
 			reader = new FileReader();
 		    }
 		    catch(e) {
 			pointboxErrorMsg("Error: unable to access file (Perhaps no browser support?  Try recent Firefox or Chrome releases.).");
 			return;
 		    }
 		    reader.readAsText(file, "UTF-8");
 		    reader.onload = fileLoaded;
 		    //reader.onerror = fileLoadError;
 		}
 	    }
 	};
 	xmlhttp.open("GET", "http://courses.teresco.org/metal/graphdata/"+value, true);
 	xmlhttp.send();	
    }
}

function readServerSearch(file)
{
	var tmgFile = file;
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
		if(xmlhttp.readyState == 4 && xmlhttp.status == 200){
			var file = new Blob([xmlhttp.responseText], {type : "text/plain"});
			file.name = tmgFile;
			if(tmgFile){
				document.getElementById('filename').innerHTML = file.name;
				var reader;
				try{
					reader = new FileReader();
				}
				catch(e){
					pointboxErrorMsg("Error: unable to access file (Perhaps no browser support?  Try recent Firefox or Chrome releases.).");
					return;
				}
				reader.readAsText(file, "UTF-8");
				reader.onload = fileLoaded;
			}
			
		}
	};
	xmlhttp.open("GET", "http://courses.teresco.org/metal/graphdata/"+tmgFile, true);
	xmlhttp.send();
}


// when the FileReader created in startRead has finished, this will be called
// to process the contents of the file
function fileLoaded(event) {
    // file done loading, read the contents
    processContents(event.target.result);
}

// process the contents of a String which came from a file or elsewhere
function processContents(fileContents) {
    
    // place the contents into the file contents area (will improve later)
    // document.getElementById('pointbox').innerHTML = "<pre>" + fileContents + "</pre>";
    // document.getElementById('selected').innerHTML = "<pre>" + fileContents + "</pre>";
    
    var pointboxContents = "";
    
    // parse the file and process as appropriate
    // TODO: check that this is always still here when we ask, might be
    // better to store the filename in a variable for safe keeping
    var fileName = document.getElementById('filename').innerHTML;
    if (fileName.indexOf(".wpt") >= 0) {
	document.getElementById('filename').innerHTML = fileName + " (Waypoint File)";
	document.getElementById('startUp').innerHTML="";
	pointboxContents = parseWPTContents(fileContents);
	showTopControlPanel();
    }
    else if (fileName.indexOf(".pth") >= 0) {
	document.getElementById('filename').innerHTML = fileName + " (Waypoint Path File)";
	document.getElementById('startUp').innerHTML="";
	pointboxContents = parsePTHContents(fileContents);
	showTopControlPanel();
    }
    else if (fileName.indexOf(".nmp") >= 0) {
	document.getElementById('filename').innerHTML = fileName + " (Near-Miss Point File)";
	document.getElementById('startUp').innerHTML="";
	pointboxContents = parseNMPContents(fileContents);
	showTopControlPanel();
    }
    else if (fileName.indexOf(".wpl") >= 0) {
	document.getElementById('filename').innerHTML = fileName + " (Waypoint List File)";
	document.getElementById('startUp').innerHTML="";
	pointboxContents = parseWPLContents(fileContents);
	showTopControlPanel();
    }
    else if (fileName.indexOf(".gra") >= 0) {
	document.getElementById('filename').innerHTML = fileName + " (Highway Graph File)";
	document.getElementById('startUp').innerHTML="";
	pointboxContents = parseGRAContents(fileContents);
    }
    else if (fileName.indexOf(".tmg") >= 0) {
	document.getElementById('filename').innerHTML = fileName + " (Highway Graph File)";
	document.getElementById('startUp').innerHTML="";
	pointboxContents = parseTMGContents(fileContents);
	showAlgorithmSelectionPanel();
    }
    
    document.getElementById('datatable').innerHTML = pointboxContents;
    hideLoadDataPanel();
    updateMap();
}

// TODO: make sure maps cannot be selected when an AV is running
function fillGraphList(e) {
    
    var sels = document.getElementById("selects");
    var orderSel = document.getElementById("orderOptions").value;
    var resSel = document.getElementById("restrictOptions").value;
    var cateSel = document.getElementById("categoryOptions").value;
    var min = document.getElementById("minVertices").value;
    var max = document.getElementById("maxVertices").value;
    if (max < 0 || min < 0 || min > max) {
	return;
    }
    if ($("#graphList").length != 0) {
	sels.removeChild(document.getElementById("graphList"));
    }
    var mapSel = document.createElement("select");
    mapSel.setAttribute("id", "graphList");
    mapSel.setAttribute("onchange", "readServer(event)");
    var init = document.createElement("option");
    init.innerHTML = "Choose a Graph";
    init.value = "init";
    mapSel.appendChild(init);		
    sels.appendChild(mapSel);
    var params = {
	order:orderSel,
	restrict:resSel,
	category:cateSel,
	min:min,
	max:max
    };
    var jsonParams = JSON.stringify(params);
    $.ajax({
        type: "POST",
        url: "./generateGraphList.php",
	datatype: "json",
        data: {"params":jsonParams},
        success: function(data) {
            var opts = $.parseJSON(data);
	    var txt = opts['text'];
	    var values = opts['values'];
	    var vertices = opts['vertices'];
	    var edges = opts['edges'];
	    var opt;
	    var str = "";
	    if (txt.length == 0) {
		alert("No graphs matched!  Please choose less restrictive filters.");
	    }
	    for (var i = 0; i < txt.length; i++) {
		opt = document.createElement("option");
		if (values[i].indexOf("simple") != -1) {
		    str = txt[i] + " (simple), size: (" + vertices[i] + ", " + edges[i] + ")";
		}
		else {
		    str = txt[i] + ", size: (" + vertices[i] + ", " + edges[i] + ")" ;
		}
		opt.innerHTML = str;
		opt.value = values[i];
		document.getElementById("graphList").appendChild(opt);
	    }
	}
    });
}

// in case we get an error from the FileReader
function errorHandler(evt) {

    if (evt.target.error.code == evt.target.error.NOT_READABLE_ERR) {
	// The file could not be read
	document.getElementById('filecontents').innerHTML = "Error reading file...";
    }
}

// parse the contents of a .tmg file
//
// First line specifies TMG and version number (expected to be 1.0),
// followed by the word "collapsed" (only supported option so far)
// indicating that the hidden vertices in the graph are collapsed
// into intermediate points along edges.
//
// Second line specifies the number of vertices, numV, and the number
// of edges, numE
//
// Next numV lines are a waypoint name (a String) followed by two
// floating point numbers specifying the latitude and longitude
//
// Next numE lines are vertex numbers (based on order in the file)
// that are connected by an edge followed by a String listing the
// highway names that connect those points, followed by pairs of
// floating point numbers, all space-separated, indicating the
// coordinates of any shaping points along the edge
//
function parseTMGContents(fileContents) {
    
    var lines = fileContents.replace(/\r\n/g,"\n").split('\n');
    var header = lines[0].split(' ');
    if (header[0] != "TMG") {
	return '<table class="table"><thead class = "thead-dark"><tr><th scope="col">Invalid TMG file (missing TMG marker on first line)</th></tr></table>';
    }
    if (header[1] != "1.0") {
	return '<table class="table"><thead class = "thead-dark"><tr><th scope="col">Unsupported TMG file version (' + header[1] + ')</th></tr></table>';
    }
    if ((header[2] != "simple") && (header[2] != "collapsed")) {
	return '<table class="table"><thead class = "thead-dark"><tr><th scope="col">Unsupported TMG graph format (' + header[2] + ')</th></tr></table>';
    }
    var counts = lines[1].split(' ');
    var numV = parseInt(counts[0]);
    var numE = parseInt(counts[1]);
    var summaryInfo = '<table class="table-sm"><thead class = "thead-dark"><tr><th scope="col">' + numV + " waypoints, " + numE + " connections.</th></tr></table>";
    
    var vTable = '<table id="waypoints" class="table table-light table-bordered"><thead class = "thead-dark"><tr><th scope="col" colspan="3">Waypoints</th></tr><tr><th>#</th><th scope="col">Coordinates</th><th scope="col">Waypoint Name</th></tr></thead><tbody>';
    
    waypoints = new Array(numV);
    for (var i = 0; i < numV; i++) {
	var vertexInfo = lines[i+2].split(' ');
	waypoints[i] = new Waypoint(vertexInfo[0], vertexInfo[1], vertexInfo[2], "", new Array());
        
        var vsubstr =  parseFloat(vertexInfo[1]).toFixed(3) + ',' +
            parseFloat(vertexInfo[2]).toFixed(3) 
	    +'</td>' + '<td style ="word-break:break-all;">' + (waypoints[i].label).substring(0,10);
        var e = "...";
        if(((waypoints[i]).label).length > 10){
            
            vsubstr =  parseFloat(vertexInfo[1]).toFixed(3) + ',' +
		parseFloat(vertexInfo[2]).toFixed(3) 
		+'</td>' + '<td style ="word-break:break-all;">' + (waypoints[i].label).substring(0,10) + e;
        }
        
        var vsubstrL =  parseFloat(vertexInfo[1]).toFixed(3) + ',' +
            parseFloat(vertexInfo[2]).toFixed(3) 
	    + waypoints[i].label;
        
	vTable += '<tr id="waypoint' + i + '" title = "' + vsubstrL + '"'  +'" onmouseover = "hoverV('+i+', false)" onmouseout = "hoverEndV('+i+', false)" onclick = "labelClickHDX('+i+')" ><td style ="word-break:break-all;">' + i +'</td>';
        
        var vstr = '<td style ="word-break:break-all;"' ; 
        var vstr2 = vstr +'>' + vsubstr + '</td></tr>';
        vTable += vstr2;
    }
    vTable += '</tbody></table>';
    
    var eTable = '<table  id="connection" class="table table-light"><thead class = "thead-dark"><tr><th scope="col" colspan="3">Connections</th></tr><tr><th scope="col">#</th><th scope="col">Route Name(s)</th><th scope="col">Endpoints</th></tr></thead><tbody>';
    graphEdges = new Array(numE);
    for (var i = 0; i < numE; i++) {
	var edgeInfo = lines[i+numV+2].split(' ');
	var newEdge;
	if (edgeInfo.length > 3) {
            newEdge = new GraphEdge(edgeInfo[0], edgeInfo[1], edgeInfo[2], edgeInfo.slice(3));
	}
	else {
            newEdge = new GraphEdge(edgeInfo[0], edgeInfo[1], edgeInfo[2], null);
	}
	var firstNode = Math.min(parseInt(newEdge.v1), parseInt(newEdge.v2));
	var secondNode = Math.max(parseInt(newEdge.v1), parseInt(newEdge.v2));
	// add this new edge to my endpoint vertex adjacency lists
	waypoints[newEdge.v1].edgeList.push(newEdge);
	waypoints[newEdge.v2].edgeList.push(newEdge);
	var test = edgeInfo[0] + ':&nbsp;' + waypoints[newEdge.v1].label +
            ' &harr; ' + edgeInfo[1] + ':&nbsp;'
	    + waypoints[newEdge.v2].label;
	var subst = '<td style ="word-break:break-all;">'
            + edgeInfo[0] + ':&nbsp;' + (waypoints[newEdge.v1].label).substring(0,5) +
            ' &harr; ' + edgeInfo[1] + ':&nbsp;'
	    + (waypoints[newEdge.v2].label).substring(0,5) + '</td>';
        
        eTable += '<tr title = "' + test + '"' + 'onmouseover="hoverE(event,'+i+')" onmouseout="hoverEndE(event,'+i+')" onclick="edgeClick('+i+')" id="connection' + i + '" class="v_' + firstNode + '_' + secondNode + '"><td id = "connectname" style ="word-break:break-all;" >' + i + '</td>';
	
        var subst2 = '<td style ="word-break:break-all;"'; 
        var subst3 = subst2 + '>' + edgeInfo[2] + subst;
	eTable += subst3;
        
        graphEdges[i] = newEdge;
	// record edge index in GraphEdge structure
	newEdge.edgeListIndex = i;
    }
    
    eTable += '</tbody></table>';
    genEdges = false;
    usingAdjacencyLists = true;
    hdxAV.setStatus(hdxStates.GRAPH_LOADED);
    return summaryInfo + '<p />' + vTable + '<p />' + eTable;
}

// parse the contents of a .gra file
//
// First line specifies the number of vertices, numV, and the number
// of edges, numE
// Next numV lines are a waypoint name (a String) followed by two
// floating point numbers specifying the latitude and longitude
// Next numE lines are vertex numbers (based on order in the file)
// that are connected by an edge followed by a String listing the
// highway names that connect those points
function parseGRAContents(fileContents) {

    var lines = fileContents.replace(/\r\n/g,"\n").split('\n');
    var counts = lines[0].split(' ');
    var numV = parseInt(counts[0]);
    var numE = parseInt(counts[1]);
    var sideInfo = '<table  class="gratable"><thead><tr><th>' + numV + " waypoints, " + numE + " connections.</th></tr></table>";

    var vTable = '<table class="gratable"><thead><tr><th colspan="3">Waypoints</th></tr><tr><th>#</th><th>Coordinates</th><th>Waypoint Name</th></tr></thead><tbody>';

    waypoints = new Array(numV);
    for (var i = 0; i < numV; i++) {
	var vertexInfo = lines[i+1].split(' ');
	waypoints[i] = new Waypoint(vertexInfo[0], vertexInfo[1], vertexInfo[2], "", "");
	vTable += '<tr><td>' + i +
	    '</td><td>(' + parseFloat(vertexInfo[1]).toFixed(3) + ',' +
	    parseFloat(vertexInfo[2]).toFixed(3) + ')</td><td>'
	    + "<a onclick=\"javascript:labelClickHDX(" + i + ");\">"
	    + waypoints[i].label + "</a></td></tr>"
    }
    vTable += '</tbody></table>';

    var eTable = '<table class="gratable"><thead><tr><th colspan="3">Connections</th></tr><tr><th>#</th><th>Route Name(s)</th><th>Endpoints</th></tr></thead><tbody>';
    graphEdges = new Array(numE);
    for (var i = 0; i < numE; i++) {
	var edgeInfo = lines[i+numV+1].split(' ');
	graphEdges[i] = new GraphEdge(edgeInfo[0], edgeInfo[1], edgeInfo[2], null);
	eTable += '<tr><td>' + i + '</td><td>' + edgeInfo[2] + '</td><td>'
	    + edgeInfo[0] + ':&nbsp;' + waypoints[graphEdges[i].v1].label +
	    ' &harr; ' + edgeInfo[1] + ':&nbsp;'
	    + waypoints[graphEdges[i].v2].label + '</td></tr>';
    }
    eTable += '</tbody></table>';
    genEdges = false;
    hdxAV.setStatus(hdxStates.GRAPH_LOADED);
    return sideInfo + '<p />' + vTable + '<p />' + eTable;
}

// parse the contents of a .wpt file
//
// Consists of a series of lines each containing a waypoint name
// and an OSM URL for that point's location:
//
/*
YT1_S http://www.openstreetmap.org/?lat=60.684924&lon=-135.059652
MilCanRd http://www.openstreetmap.org/?lat=60.697199&lon=-135.047250
+5 http://www.openstreetmap.org/?lat=60.705383&lon=-135.054932
4thAve http://www.openstreetmap.org/?lat=60.712623&lon=-135.050619
*/
function parseWPTContents(fileContents) {

    var lines = fileContents.replace(/\r\n/g,"\n").split('\n');
    graphEdges = new Array();
    waypoints = new Array();
    for (var i = 0; i < lines.length; i++) {
	if (lines[i].length > 0) {
	    waypoints[waypoints.length] = WPTLine2Waypoint(lines[i]);
	}
    }
    genEdges = true;
    hdxAV.setStatus(hdxStates.WPT_LOADED);
    return "<h2>Raw file contents:</h2><pre>" + fileContents + "</pre>";
}

// parse the contents of a .pth file
//
// Consists of a series of lines each containing a route name, zero or
// more intermediate points (latitude, longitude pairs), then a
// waypoint name and a latitude and a longitude, all space-separated,
// or a line containing a route name and waypoint name followed by a
// lat,lng pair in parens
//
/*
START YT2@BorRd (60.862343,-135.196595)
YT2 YT2@TakHSRd (60.85705,-135.202029)
YT2 (60.849881,-135.203934) (60.844649,-135.187111) (60.830141,-135.187454) YT1_N/YT2_N (60.810264,-135.205286)
YT1,YT2 (60.79662,-135.170288) YT1/YT2@KatRd (60.788579,-135.166302)
YT1,YT2 YT1/YT2@WannRd (60.772479,-135.15044)
YT1,YT2 YT1/YT2@CenSt (60.759893,-135.141191)

or

START YT2@BorRd 60.862343 -135.196595
YT2 YT2@TakHSRd 60.85705 -135.202029
YT2 60.849881 -135.203934 60.844649 -135.187111 60.830141 -135.187454 YT1_N/YT2_N 60.810264 -135.205286
YT1,YT2 60.79662 -135.170288 YT1/YT2@KatRd 60.788579 -135.166302
YT1,YT2 YT1/YT2@WannRd 60.772479 -135.15044
YT1,YT2 YT1/YT2@CenSt 60.759893 -135.141191

*/
function parsePTHContents(fileContents) {

    var table = '<table class="pthtable"><thead><tr><th>Route</th><th>To Point</th><th>Seg.<br>Miles</th><th>Cumul.<br>Miles</th></tr></thead><tbody>';
    var lines = fileContents.replace(/\r\n/g,"\n").split('\n');
    graphEdges = new Array();
    waypoints = new Array();
    var totalMiles = 0.0;
    var segmentMiles = 0.0;
    var previousWaypoint = null;
    for (var i = 0; i < lines.length; i++) {
	if (lines[i].length > 0) {
	    // standardize first
	    var line = standardizePTHLine(lines[i]);
	    var info = PTHLineInfo(line, previousWaypoint);
	    waypoints[waypoints.length] = info.waypoint;
	    totalMiles += info.mileage;
	    // this will display as a graph, so create and assign the
	    // graph edges
	    if (previousWaypoint != null) {
		var newEdge = new GraphEdge(i-1, i, info.waypoint.elabel, info.via);
		previousWaypoint.edgeList[previousWaypoint.edgeList.length] = newEdge;
		info.waypoint.edgeList[0] = newEdge;
	    }
	    previousWaypoint = info.waypoint;
	    table += '<tr><td>' + waypoints[waypoints.length-1].elabel +
		"</td><td><a onclick=\"javascript:labelClickHDX(0);\">" + waypoints[waypoints.length-1].label +
		'</a></td><td style="text-align:right">' + info.mileage.toFixed(2) +
		'</td><td style="text-align:right">' + totalMiles.toFixed(2) +
		'</td></tr>';
	}
    }
    table += '</tbody></table>';
    //genEdges = true;
    usingAdjacencyLists = true;
    hdxAV.setStatus(hdxStates.PTH_LOADED);
    return table;
}

// parse the contents of a .nmp file
//
// Consists of a series of lines, each containing a waypoint name
// followed by two floating point numbers representing the point's
// latitude and longitude
//
// Entries are paired as "near-miss" points, and a graph edge is
// added between each pair for viewing.
//
function parseNMPContents(fileContents) {

    var table = '<table class="nmptable"><thead /><tbody>';
    // all lines describe waypoints
    var lines = fileContents.replace(/\r\n/g,"\n").split('\n');
    waypoints = new Array();
    waypointColors = new Array();
    for (var i = 0; i < lines.length; i++) {
	if (lines[i].length > 0) {
	    var xline = lines[i].split(' ');
	    if (xline.length == 3 || xline.length == 4) {
		waypoints[waypoints.length] = new Waypoint(xline[0], xline[1], xline[2], "", "");
		if (xline.length == 3) {
		    waypointColors[waypointColors.length] = "red";
		}
		else {
		    if (xline[3] == "FP" || xline[3] == "FPLI") {
			waypointColors[waypointColors.length] = "green";
		    }
		    else { // must be "LI"
			waypointColors[waypointColors.length] = "yellow";
		    }
		}
	    }
	}
    }
    // graph edges between pairs, will be drawn as connections
    var numE = waypoints.length/2;
    graphEdges = new Array(numE);
    for (var i = 0; i < numE; i++) {
	// add the edge
	graphEdges[i] = new GraphEdge(2*i, 2*i+1, "", null);

	// add an entry to the table to be drawn in the pointbox
	var miles = distanceInMiles(waypoints[2*i].lat, waypoints[2*i].lon,
				    waypoints[2*i+1].lat,
				    waypoints[2*i+1].lon).toFixed(4);
	var feet = distanceInFeet(waypoints[2*i].lat, waypoints[2*i].lon,
				  waypoints[2*i+1].lat,
				  waypoints[2*i+1].lon).toFixed(2);
	table += "<tr style=\"background-color:" + waypointColors[2*i] +
	    "\"><td><table class=\"nmptable2\"><thead /><tbody><tr><td>"
	    + "<a onclick=\"javascript:labelClickHDX(" + 2*i + ");\">"
	    + waypoints[2*i].label + "</a></td><td>("
	    + waypoints[2*i].lat + ","
	    + waypoints[2*i].lon + ")</td></tr><tr><td>"
	    + "<a onclick=\"javascript:labelClickHDX(" + (2*i+1) + ");\">"
	    + waypoints[2*i+1].label + "</a></td><td>("
	    + waypoints[2*i+1].lat + ","
	    + waypoints[2*i+1].lon + ")</td></tr>"
	    + "</tbody></table></td><td>"
	    + miles  + " mi/"
	    + feet + " ft</td></tr>";
    }

    table += "</tbody></table>";
    genEdges = false;
    hdxAV.setStatus(hdxStates.NMP_LOADED);
    // register the HDX-specific event handler for waypoint clicks
    registerMarkerClickListener(labelClickHDX);
    return table;
}

// parse the contents of a .wpl file
//
// Consists of a series of lines, each containing a waypoint name
// followed by two floating point numbers representing the point's
// latitude and longitude
//
function parseWPLContents(fileContents) {

    var vTable = '<table class="gratable"><thead><tr><th colspan="2">Waypoints</th></tr><tr><th>Coordinates</th><th>Waypoint Name</th></tr></thead><tbody>';

    // all lines describe waypoints
    var lines = fileContents.replace(/\r\n/g,"\n").split('\n');
    waypoints = new Array();
    for (var i = 0; i < lines.length; i++) {
	if (lines[i].length > 0) {
	    var vertexInfo = lines[i].split(' ');
	    if (vertexInfo.length == 3) {
		var w = new Waypoint(vertexInfo[0], vertexInfo[1], vertexInfo[2], "", "");
		waypoints[waypoints.length] = w;
		vTable += '<tr><td>(' + parseFloat(vertexInfo[1]).toFixed(3) + ',' +
		    parseFloat(vertexInfo[2]).toFixed(3) + ')</td><td>'
		    + "<a onclick=\"javascript:labelClickHDX(" + i + ");\">"
		    + w.label + "</a></td></tr>"
	    }
	}
    }
    vTable += '</tbody></table>';
    // no edges here
    graphEdges = new Array();
    genEdges = false;
    var summaryInfo = '<table class="gratable"><thead><tr><th>' + waypoints.length + " waypoints.</th></tr></table>";
    hdxAV.setStatus(hdxStates.WPL_LOADED);
    return summaryInfo + '<p />' + vTable;
}

function WPTLine2Waypoint(line) {

    // remove extraneous spaces in the line
    line = line.replace('  ', ' ');
    line = line.replace('  ', ' ');
    line = line.replace('  ', ' ');
    line = line.replace('  ', ' ');

    var xline = line.split(' ');
    if (xline.length < 2) {
	return Waypoint('bad-line', 0, 0);
    }
    var label = xline[0];
    var url = xline[xline.length-1];
    var latlon = Url2LatLon(url);
    return new Waypoint(label, latlon[0], latlon[1], 0, "");
}

// convert an openstreetmap URL to a latitude/longitude
function Url2LatLon(url) {

    var latlon = new Array(0., 0.);
    var floatpattern = '([-+]?[0-9]*\.?[0-9]+)';
    var latpattern = 'lat=' + floatpattern;
    var lonpattern = 'lon=' + floatpattern;

    //search for lat
    var matches = url.match(latpattern);
    if (matches != null) {
	latlon[0] = parseFloat(matches[1]).toFixed(6);
    }

    //search for lon
    matches = url.match(lonpattern);
    if (matches != null) {
	latlon[1] = parseFloat(matches[1]).toFixed(6);
    }

    return latlon;
}

// "standardize" a PTH line so it has coordinates separated by a space
// instead of in parens and with any extraneous spaces removed
function standardizePTHLine(line) {

    // remove extraneous spaces
    var newline = line;
    do {
	line = newline;
	newline = line.replace('  ',' ');
    } while (line != newline);


    // if this doesn't end in a paren, we should be good
    if (!line.endsWith(')')) {
	return line;
    }

    // this ends in a paren, so we convert each "(lat,lng)" group to
    // simply "lat lng"
    var xline = line.split(' ');
    line = xline[0];
    for (var pos = 1; pos < xline.length; pos++) {
	var newlatlng = xline[pos];
	if ((xline[pos].charAt(0) == '(') &&
	    (xline[pos].indexOf(',') > 0) &&
	    (xline[pos].charAt(xline[pos].length-1) == ')')) {
	    newlatlng = xline[pos].replace('(', '');
	    newlatlng = newlatlng.replace(',', ' ');
	    newlatlng = newlatlng.replace(')', '');
	}
	line += " " + newlatlng;
    }
    return line;
}

// convert a "standardized" PTH line to a Waypoint object with support
// for intermediate points along a segment
function PTHLine2Waypoint(line) {

    var xline = line.split(' ');
    if (xline.length < 4) {
	return Waypoint('bad-line', 0, 0);
    }
    return new Waypoint(xline[xline.length-3], xline[xline.length-2], xline[xline.length-1], 0, xline[0]);

}

// OLD: convert PTH line to a Waypoint object
function PTHLine2WaypointOLD(line) {

    // remove any extraneous spaces in the line
    line = line.replace('  ', ' ');
    line = line.replace('  ', ' ');
    line = line.replace('  ', ' ');
    line = line.replace('  ', ' ');

    var xline = line.split(' ');
    // check for and convert a (lat,lng) format
    if ((xline.length == 3) &&
	(xline[2].charAt(0) == '(') &&
	(xline[2].indexOf(',') > 0) &&
	(xline[2].charAt(xline[2].length-1) == ')')) {
	newlatlng = xline[2].replace('(', '');
	newlatlng = newlatlng.replace(',', ' ');
	newlatlng = newlatlng.replace(')', '');
	return PTHLine2Waypoint(xline[0] + " " + xline[1] + " " + newlatlng);
    }
    if (xline.length < 4) {
	return Waypoint('bad-line', 0, 0);
    }
    return new Waypoint(xline[1], xline[2], xline[3], 0, xline[0]);
}

// mileage with a "standardized" PTH line that could have intermediate points
// to include
function mileageWithPTHLine(from, to, line) {

    var xline = line.split(' ');
    if (xline.length == 4) {
	// no intermediate points, so just compute mileage
	return distanceInMiles(from.lat, from.lon, to.lat, to.lon);
    }

    // we have more points, compute sum of segments
    var total = 0.0;
    var last_lat = from.lat;
    var last_lon = from.lon;
    var num_points = (xline.length - 4) / 2;
    for (var i = 0; i < num_points; i++) {
	var this_lat = parseFloat(xline[2*i+1]).toFixed(6);
	var this_lon = parseFloat(xline[2*i+2]).toFixed(6);
	total += distanceInMiles(last_lat, last_lon, this_lat, this_lon);
	last_lat = this_lat;
	last_lon = this_lon;
    }
    total += distanceInMiles(last_lat, last_lon, to.lat, to.lon);
    return total;
}

// parse all useful info from a "standardized" PTH file line and
// return in an object with fields for waypoint (a Waypoint object),
// mileage (a number), and via, an array of lat/lng values the
// path passes through that will be used to construct the edge
// that this line represents in the path
// extra parameter is the previous waypoint for mileage computation
function PTHLineInfo(line, from) {

    var xline = line.split(' ');
    if (xline.length < 4) {
	return {
	    waypoint: Waypoint('bad-line', 0, 0),
	    mileage: 0.0,
	    via: null};
    }
    var result = {
	waypoint: new Waypoint(xline[xline.length-3], xline[xline.length-2],
			       xline[xline.length-1], xline[0], new Array()),
	mileage: 0.0,
	via: null
    };

    if (xline.length == 4) {
	// no intermediate points, so just compute mileage and have a
	// null "via" list
	if (from != null) {
	    result.mileage = distanceInMiles(from.lat, from.lon,
					     result.waypoint.lat,
					     result.waypoint.lon);
	}
	result.via = null;
    }
    else {
	// we have more points, compute sum of segments
	// and remember our list of lat/lng points in via
	var total = 0.0;
	var last_lat = from.lat;
	var last_lon = from.lon;
	var num_points = (xline.length - 4) / 2;
	for (var i = 0; i < num_points; i++) {
	    var this_lat = parseFloat(xline[2*i+1]).toFixed(6);
	    var this_lon = parseFloat(xline[2*i+2]).toFixed(6);
	    total += distanceInMiles(last_lat, last_lon, this_lat, this_lon);
	    last_lat = this_lat;
	    last_lon = this_lon;
	}
	total += distanceInMiles(last_lat, last_lon,
				 result.waypoint.lat, result.waypoint.lon);
	result.mileage = total;
	result.via = xline.slice(1,xline.length-3);
    }
    return result;
}



// get the selected algorithm from the AlgorithmSelection menu
// (factored out here to avoid repeated code)
function getSelectedAlgorithm() {
    var menuSelection = document.getElementById("AlgorithmSelection");
    var selectionIndex = menuSelection.selectedIndex;
    return menuSelection.options[selectionIndex].value;
}

// pseudocode display event handler
// function both sets the traceActions variable and shows/hides
// the actual code on the display as appropriate
function showHidePseudocode() {

    hdxAV.traceActions = document.getElementById("pseudoCheckbox").checked;
    document.getElementById("pseudoText").style.display =
	(hdxAV.traceActions ? "" : "none");
}

// generic event handler for start/pause/resume button
function startPausePressed() {
    
    switch (hdxAV.status) {

    case hdxStates.AV_SELECTED:
	// if we have selected but not yet started an algorithm,
	// this is a start button
	hdxAV.setStatus(hdxStates.AV_RUNNING);
	if (hdxAV.delay == -1) {
	    hdxAV.startPause.innerHTML = "Next Step";
	}
	else {
	    hdxAV.startPause.innerHTML = "Pause";
	}
	hdxAV.currentAV.prepToStart();
	// set pseudocode
	document.getElementById("pseudoText").innerHTML = hdxAV.currentAV.code;

	// reset all execution counts
	hdxAV.execCounts = [];
	hdxAV.maxExecCount = 0;

	showHidePseudocode();

	// get the simulation going, always start with the "START"
	// action, then do it
	hdxAV.nextAction = "START";
	hdxAV.nextStep(hdxAV.currentAV);
	break;
	
    case hdxStates.AV_RUNNING:
	// if we are in a running algorithm, this is a pause button
	// the running algorithm will pause when its next
	// timer event fires	
	hdxAV.setStatus(hdxStates.AV_PAUSED);
	if (hdxAV.delay == -1){
	    hdxAV.startPause.innerHTML = "Next Step";
	}
	else {
	    hdxAV.startPause.innerHTML = "Resume";
	}
	break;
	
    case hdxStates.AV_PAUSED:

	// depending on whether we're stepping or not, button
	// will need different labels
	if (hdxAV.delay == -1) {
	    hdxAV.startPause.innerHTML = "Next Step";
	}
	else {
	    hdxAV.startPause.innerHTML = "Pause";
	}

	// in all cases, we set status to running and perform the next step
	hdxAV.setStatus(hdxStates.AV_RUNNING);
	hdxAV.nextStep(hdxAV.currentAV);
	break;

    default:
	alert("startPausePressed, unexpected status=" + hdxAV.status);
    }
}

// Event handler for state change on the algorithm selection select control
function algorithmSelectionChanged() {

    // cleanup anything from the previous algorithm
    if (hdxAV.currentAV != null) {
	cleanupAVControlPanel();
	hdxAV.currentAV.cleanupUI();
    }
    
    let value = getSelectedAlgorithm();

    // set the current algorithm
    for (var i = 1; i < hdxAV.avList.length; i++) {
	if (value == hdxAV.avList[i].value) {
	    hdxAV.currentAV = hdxAV.avList[i];
	    break;
	}
    }

    document.getElementById("currentAlgorithm").innerHTML =
	hdxAV.currentAV.name;

    // call its function to set up its status and options
    hdxAV.currentAV.setupUI();
}

// event handler for the "Done" button on the algorithm options panel
function algOptionsDonePressed() {

    // TODO: make sure no additional validation is needed to make sure
    // good options are chosen before we allow this to be dismissed.

    if (hdxAV.currentAV == null) {
	hdxAV.currentAV = hdxNoAV;
    }
    
    // set status depending on whether an AV was selected
    if (hdxAV.currentAV.value == hdxNoAV.value) {
	hdxAV.setStatus(hdxStates.GRAPH_LOADED);
    }
    else {
	hdxAV.setStatus(hdxStates.AV_SELECTED);
	showAVStatusPanel();
    }

    hideAlgorithmSelectionPanel();
    showTopControlPanel();
}

// event handler for "Reset AV" button press
function resetPressed() {

    // if there's an AV running, we need to pause it
    if (hdxAV.status == hdxStates.AV_RUNNING) {
	hdxAV.setStatus(hdxStates.AV_PAUSED);
	hdxAV.startPause.innerHTML = "Start";
    }

    // show waypoints, show connections
    initWaypointsAndConnections(true, true,
				visualSettings.undiscovered);

    hideTopControlPanel();
    cleanupAVControlPanel();
    algorithmSelectionChanged();
    hideAVStatusPanel();
    showAlgorithmSelectionPanel();
}

// event handler for "Load Data Options" button
function loadDataOptionsPressed() {

    switch (hdxAV.status) {

    case hdxStates.AV_RUNNING:
	// if there's an AV running, we need to pause it
	hdxAV.setStatus(hdxStates.AV_PAUSED);
	hdxAV.startPause.innerHTML = "Start";
	// break intentionally omitted

    case hdxStates.AV_PAUSED:
    case hdxStates.AV_COMPLETE:
    case hdxStates.GRAPH_LOADED:
	// show waypoints, show connections
	initWaypointsAndConnections(true, true,
				    visualSettings.undiscovered);
	
	cleanupAVControlPanel();
	algorithmSelectionChanged();
	hideAVStatusPanel();
	break;
    }

    // in all cases, we hide the top panel, show the load panel
    hideTopControlPanel();
    showLoadDataPanel();
}

// event handler for "Show Data Tables" checkbox
function showHideDatatables() {

    let checked = document.getElementById("datatablesCheckbox").checked;
    let datatable = document.getElementById("datatable");
    if (checked) {
	datatable.style.display = "";
    }
    else {
	datatable.style.display = "none";
    }
}

// Functions to show and hide panels that are displayed only
// in certain modes of HDX operation

// top control panel (algorithm controls, reset/load buttons)
function showTopControlPanel() {

    let av1 = document.getElementById("topControlPanelAV1");
    let av2 = document.getElementById("topControlPanelAV2");
    let av3 = document.getElementById("topControlPanelAV3");
    let av4 = document.getElementById("topControlPanelAV4");
    let av4button = document.getElementById("resetButton");
    let showHidden = document.getElementById("topControlPanelShowHidden");
    
    // show only the relevant components given the current
    // state of HDX
    switch (hdxAV.status) {
    case hdxStates.WPT_LOADED:
    case hdxStates.NMP_LOADED:
    case hdxStates.WPL_LOADED:
    case hdxStates.PTH_LOADED:
	// undisplay all AV-related controls
	av1.style.display = "none";
	av2.style.display = "none";
	av3.style.display = "none";
	av4.style.display = "none";
	showHidden.style.display = "";
	break;

    case hdxStates.GRAPH_LOADED:
	// only display the "Reset AV" button (but relabel it
	// as "Select AV" since this means no AV is currently
	// selected
	av1.style.display = "none";
	av2.style.display = "none";
	av3.style.display = "none";
	av4.style.display = "";
	av4button.value = "Select AV";
	showHidden.style.display = "";
	break;

    default:
	// An AV is selected and possibly running, paused, or complete
	// so show all AV-related controls and make sure the "Reset AV"
	// button is labeled that way
	av1.style.display = "";
	av2.style.display = "";
	av3.style.display = "";
	av4.style.display = "";
	av4button.value = "Reset AV";
	showHidden.style.display = "none";
	break;
    }
    
    document.getElementById("topControlPanel").style.display="table";
}

function hideTopControlPanel() {
    document.getElementById("topControlPanel").style.display="none";
}

// the load data panel, where graphs and other data are specified
// to be loaded into HDX
function showLoadDataPanel() {
    document.getElementById("loadDataPanel").style.display = "table";
    document.getElementById("hideLoadDataPanel").disabled=false;
}

function hideLoadDataPanel() {
    document.getElementById("loadDataPanel").style.display ="none";
}

// the algorithm selection panel, where an algorithm is selected
// and its parameters are specified
function hideAlgorithmSelectionPanel() {
    document.getElementById("algorithmSelectionPanel").style.display="none";
}

function showAlgorithmSelectionPanel() {
    document.getElementById("algorithmSelectionPanel").style.display="table";
}

// the algorithm status panel, including messages, code, data, and
// other information showing the status of an AV
function showAVStatusPanel() {
    document.getElementById("avStatusPanel").style.display="block";
}

function hideAVStatusPanel() {
    document.getElementById("avStatusPanel").style.display="none";
}

/* function is currently obsolete, but remains as a starting point
   for its eventual replacement:

function showLegend() {
    var show = document.getElementById("showLegend").checked;
    var value = getCurrentAlgorithm();
    if (show) {
        if (value == "vertexSearch") {
            document.getElementById('legends').innerHTML = "<pre> Longest Label : green \n " +
                "Shortest Label: brown \n" + " Vertex winners in the table and map: red \n" +
                " Current vertex in the table and map : yellow \n</pre>";
        }
	else if (value == "DFS") {
            document.getElementById('legends').innerHTML = "<pre> Starting vertex : green\n" + " Vertex visiting for the first time : yellow\n" + " Edges got used before visiting the candidate : red\n" +
                " Neighbor edges and possible next candidate: purple\n" + " Vertex in the stack : blue\n" + " Vertex that no be in the stack anymore : gray\n </pre>";
        }
	else if (value == "BFS") {
            document.getElementById('legends').innerHTML = "<pre> Starting vertex : green\n" + "<i>show the yellow</i> \n" + "Edges got used before visiting the candidate : red\n" +
                " Neighbor edges and possible next candidate: purple\n" + " Vertex in the queue : blue\n" + " Vertex that no be in the queue anymore : gray\n </pre>";
        }
	else if (value == "EdgeSearch") {
            document.getElementById('legends').innerHTML = "<pre>// fill in for real later \n</pre>";
        }
	else if (value == "RFS") {
            document.getElementById('legends').innerHTML = "<pre> Starting vertex : green\n" + " Vertex visiting for the first time : yellow\n" + " Edges got used before visiting the candidate : red\n" +
                " Neighbor edges and possible next candidate: purple\n" + " Vertex in the list : blue\n" + " Vertex that no be in the list anymore : gray\n </pre>";
        }
    }
    else {
        document.getElementById('legends').innerHTML = "";
    }
}
*/

function drag(event) {
    var x = event.target.style.left;
    var y = event.target.style.top;
    event.dataTransfer.setData("id",event.target.id);
    if (x == "70%") {		
	event.dataTransfer.setData("x",document.documentElement.clientWidth*.7-event.clientX);
    }
    else {
	event.dataTransfer.setData("x",parseInt(x.substring(0,x.length-2))-event.clientX);
    }
    event.dataTransfer.setData("y",parseInt(y.substring(0,y.length-2))-event.clientY);
}

function drop(event) {
    event.preventDefault();
    var de = document.getElementById(event.dataTransfer.getData("id"));
    de.style.left =
	(event.clientX+parseInt(event.dataTransfer.getData("x"))) + 'px';
    de.style.top =
	(event.clientY+parseInt(event.dataTransfer.getData("y"))) + 'px';
}

function allowdrop(event) {
    event.preventDefault();
}   

/***********************************************************************/
/* Code formerly in basic-sch.js mainly, Michael Dagostino Summer 2018 */
/* Mainly involved in managing the search box to load graphs by typing */
/* a word contained in the graph's name/description.                   */
/***********************************************************************/

// adapted from the example provided by
// http://twitter.github.io/typeahead.js/examples/ The Basics also
// thanks to https://codepen.io/jonvadillo/details/NrGWEX for
// providing a working example in which to work off of

var substringMatcher = function(strs) {
    return function findMatches(q, cb) {
	var matches, substringRegex;
	
	// an array that will be populated with substring matches
	matches = [];
	
	// regex used to determine if a string contains the substring `q`
	substrRegex = new RegExp(q, 'i');
	
	// iterate through the pool of strings and for any string that
	// contains the substring `q`, add it to the `matches` array
	$.each(strs, function(i, str) {
	    if (substrRegex.test(str)) {
		matches.push(str);
	    }
	});
	
	cb(matches);
    };
};

function returnInput() {
    
    var input = document.getElementById("searchBox").value;
    var getGraph = graphs[input];
    return graphs[input];
}

// first ajax request to get all of the values for the descriptions
var description = ['Choose A Graph']; 
function getDescriptions(){
    var xmlhttp = new XMLHttpRequest();
    var descr;
    var i =0;
    xmlhttp.onreadystatechange = function() {
	if(this.readyState==4 && this.status ==200) {
	    descr = Array.from(JSON.parse(this.responseText));
	    for(i=0; i < descr.length; i++)
	    {
		description.push(descr[i]);
	    }
	}
    };
    xmlhttp.open("GET", "jsdataLoadDescr.php", true);
    xmlhttp.send();
}

// Make a new ajax request for the graphs object created in php
var graphs = {};
function getGraphs(){
    var graphsResponse;
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
	if(this.readyState==4 && this.status ==200) {
	    graphsResponse = JSON.parse(this.responseText);
	    graphs=graphsResponse;
	}
    };
    xmlhttp.open("GET", "jsLoadDataGraphs.php", true);
    xmlhttp.send();
}

$(document).ready(function(){
    $('#the-basics .typeahead').typeahead(
	{
	    hint: true,
	    highlight: true,
	    minLength: 1,
	    
	},
	{
	    name: 'description',
	    source: substringMatcher(description)
	});	
    
    // adapted from https://howtodoinjava.com/scripting/jquery/jquery-detect-if-enter-key-is-pressed/
    $("#searchBox").keypress(function(event) {
	var keycode = (event.keycode ? event.keycode : event.which);
	if(keycode == '13'){
	    var getFile = returnInput(); 
	    readServerSearch(getFile);
	}
    });
});

/**********************************************************************
 * General utility functions
 **********************************************************************/

// print a list to the console
function printList(items) {

    console.log(listToVIndexString(items));
}

// return a String containing the objects in a list
function listToVIndexString(items) {
    if (items.length == 0) {
        return "[]";
    }
    else {
        var line = `[`;
        for (var i = 0; i < items.length; i++) {
            if (i == items.length - 1) {
                line += items[i].vIndex;
            } else {
                line += items[i].vIndex + `, `;
            }	    
        }
        line += ` ]`;
        return line;
    }
}

// Compute Squared Distance 
function squaredDistance(o1, o2) {
    var dx, dy;
    dx = o1.lon - o2.lon;
    dy = o1.lat - o2.lat;
    return dx * dx + dy * dy;
}

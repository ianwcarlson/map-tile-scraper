
module.exports = function(options){
    var defaults = require('./map-tile-scraper-defaults.js');
    var override = require('json-override');
    var newOptions = override(defaults.defaults, options, true);

    var tileCount = 0;
    
    // main execution function
    function run(callback){
        var d = require('domain').create();
        d.on('error', function(err){
            callback(err);
        });
        d.run(function(){
            fs = require('fs');
            var inputValid = checkBounds(newOptions.inputCoordinates);

            if (inputValid){
                var vertices = calcVertices(newOptions.inputCoordinates);
                var numTiles = 0;

                try {fs.mkdirSync(newOptions.rootDir, 0777);}
                catch(err){
                    if (err.code !== 'EEXIST') callback(err);
                }
                console.log('getting resources from: ' + newOptions.baseUrl);
                // for each zoom level 
                for (var zoomIdx=newOptions.zoom.min; zoomIdx<newOptions.zoom.max; zoomIdx++){
                    // calculate min and max tile values
                    var minAndMaxValues = calcMinAndMaxValues(vertices, zoomIdx);

                    zoomFilePath = newOptions.rootDir+zoomIdx.toString() + '/';

                    try{fs.mkdirSync(zoomFilePath, 0777);}
                    catch (err){
                        if (err.code !== 'EEXIST') callback(err);
                    }
                    for (var yIdx=minAndMaxValues.yMin; yIdx<=minAndMaxValues.yMax; yIdx++){
                        for (var xIdx=minAndMaxValues.xMin; xIdx<=minAndMaxValues.xMax; xIdx++){
                            var delay = Math.random()*newOptions.maxDelay;
                            setTimeout(getAndStoreTile(newOptions.baseUrl, zoomIdx, xIdx, yIdx, newOptions.rootDir), delay);
                            numTiles++;
                        }
                    }
                }
                console.log('total number of tiles: ', numTiles);           
            } else {
                callback(new Error('Invalid input coordinates'));
            }
        });
    }

    /* Diagram of Vertices
    (xMin, yMax)     (xMax, yMax)
         +-----------------+
         |                 |
         |                 |
         |                 |
         |        *        |
         |     (Center)    |
         |                 |
         |                 |
         +-----------------+
    (xMin, yMin)     (xMax, yMin)

    */
    /* Function Declarations */
    function mkdirErr(err){
        if (err){
            if (err.code !== 'EEXIST'){
                throw err;
            }
        }
    }

    function getAndStoreTile(baseUrl, zoom, x, y, rootDir){
        return function(){

            var http = require('http-get');
            
            var fullUrl = buildUrl(baseUrl, zoom, x, y);
            var fullPath = buildPath(rootDir, zoom, x, y);
            var dirPath = (!newOptions.xBeforeY) ? 
                buildDirPath(rootDir, zoom, y) : 
                buildDirPath(rootDir, zoom, x);   

            fullUrl += newOptions.mapSourceSuffix; 

            try {fs.mkdirSync(dirPath, 0777);}
            catch(err){
                if (err.code !== 'EEXIST') throw err;
            } 

            http.get(fullUrl, fullPath, function(err){
                if (err) throw err; 
                tileCount += 1;
            });
        };
    }

    function buildDirPath(rootDir, zoom, secondParam){
        return (rootDir + zoom.toString() + '/' + secondParam.toString() + '/');
    }

    function buildPath(rootDir, zoom, x, y){
        return (rootDir + buildSuffixPath(zoom, x, y));
    }

    function buildUrl(baseUrl, zoom, x, y){
        return (baseUrl + buildSuffixPath(zoom, x, y));
    }

    function buildSuffixPath(zoom, x, y){
        var rtnString;
        if (!newOptions.xBeforeY){
            rtnString = zoom.toString() + '/' + y.toString() + 
            '/' + x.toString();
        }
        else if (newOptions.xBeforeY){
            rtnString = zoom.toString() + '/' + x.toString() + 
            '/' + y.toString();
        }
        return (rtnString);
    }

    function calcMinAndMaxValues(vertices, zoom){
        var minAndMaxObj = {};

        /* Not sure why yMin and yMax are transposed on the tile coordinate system */
        minAndMaxObj.yMax = convLat2YTile(vertices.lowerLeft.lat, zoom);
        minAndMaxObj.xMin = convLon2XTile(vertices.lowerLeft.lon, zoom);
        minAndMaxObj.yMin = convLat2YTile(vertices.upperRight.lat, zoom);
        minAndMaxObj.xMax = convLon2XTile(vertices.upperRight.lon, zoom);

        return minAndMaxObj;
    }

    function calcVertices(result){
        var vertices = {};
        var radius = calcRadius(result.sqKms);
        var distance = radius * Math.SQRT2;
        var centerRadLat = convDecToRad(result.lat);
        var centerRadLon = convDecToRad(result.lng);

        vertices.upperRight = calcEndPoint(centerRadLat, centerRadLon,
            distance, Math.PI/4);
        vertices.lowerRight = calcEndPoint(centerRadLat, centerRadLon,
            distance, 3*Math.PI/4);
        vertices.lowerLeft = calcEndPoint(centerRadLat, centerRadLon,
            distance, 5*Math.PI/4);
        vertices.upperLeft = calcEndPoint(centerRadLat, centerRadLon,
            distance, 7*Math.PI/4);

        //printVertices(vertices);

        return vertices;
    }

    function calcRadius(sqKms){
        var radius = Math.sqrt(sqKms);
        return radius;
    }

    function calcEndPoint(startX, startY, distance, bearing){
        var d = distance;
        var brng = bearing;
        var R = 6371; // earth's radius in km
        var endPoint = {};

        endPoint.lat = Math.asin( Math.sin(startX)*Math.cos(d/R) +
            Math.cos(startX)*Math.sin(d/R)*Math.cos(brng) );
        endPoint.lon = startY + Math.atan2(Math.sin(brng)*Math.sin(d/R)*Math.cos(startX),
            Math.cos(d/R)-Math.sin(startX)*Math.sin(endPoint.lat));

        return endPoint;
    }

    function convLon2XTile(lon, zoom){
        return (Math.floor(((lon*180/Math.PI)+180)/360*Math.pow(2,zoom)));
    }

    function convLat2YTile(lat, zoom){
        return (Math.floor((1-Math.log(Math.tan(lat) + 
            1/Math.cos(lat))/Math.PI)/2 *Math.pow(2,zoom)));
    }

    function convDecToRad(dec){
        return (dec*Math.PI/180);
    }

    function convRadToDec(rad){
        return (rad*180/Math.PI);
    }

    function convRadToDecCoordinates(coordinates){
        decCoordinates = {};
        decCoordinates.lat = convRadToDec(coordinates.lat);
        decCoordinates.lon = convRadToDec(coordinates.lon);
        return decCoordinates;
    }

    function checkBounds(result) {
        if (result.lat > 90 || result.lat < -90){
            console.log('latitude should be less than 90 and greater than' +
                '-90');
            return false;
        }
        if (result.lng > 180 || result.lng < -180){
            console.log('longitude should be less than 180 and greater than' +
                '-180');
            return false;
        }
        if (result.sqKms > 100000 || result.sqKms < 0){
            console.log('sqKms should be greater than 0 and less than 10');
            return false;
        }
        return true;
    }

    function printVertices(vertices){
        console.log('Upper-right vertex: ', convRadToDecCoordinates(vertices.upperRight));
        console.log('Lower-right vertex: ', convRadToDecCoordinates(vertices.lowerRight));
        console.log('Lower-left vertex: ', convRadToDecCoordinates(vertices.lowerLeft));
        console.log('Upper-left vertex: ', convRadToDecCoordinates(vertices.upperLeft));
    }

    function isDefinedNotNull(inputVar){
        var valid = false;
        if (typeof inputVar !== 'undefined' && inputVar !== null){
            valid = true;
        }
        return valid;
    }

    function validateInputString(inputString){
        var inputValid = false;
        if (isDefinedNotNull(inputString) &&
            typeof inputString === 'string'){ 
            inputValid = true;
        }
        return inputValid;   
    }

    function validateZoom(inputZoom){
        var validParams = false;
        var MAX_ZOOM = 19;
        var MIN_ZOOM = 0;

        if (isDefinedNotNull(inputZoom)){
            if (isDefinedNotNull(inputZoom.max) && isDefinedNotNull(inputZoom.min) &&
                inputZoom.max > inputZoom.min && inputZoom.max <= MAX_ZOOM && inputZoom.max > MIN_ZOOM &&
                inputZoom.min < MAX_ZOOM && inputZoom.min > MIN_ZOOM){
                validParams = true;
            }
        }

        if (!validParams){
            console.log('Invalid input zoom parameters (0-19), max greater than min');
        } 
        return validParams;  
    }

    function setInputCoordinates(lat, lng, sqKms){
        if (isDefinedNotNull(lat) && isDefinedNotNull(lng) &&
            isDefinedNotNull(sqKms)){
            newOptions.inputCoordinates.lat = lat;
            newOptions.inputCoordinates.lng = lng;
            newOptions.inputCoordinates.sqKms = sqKms;
        }
    }

    function setUrlByMapProvider(inputMapSource){
        var inputValid = false;
        if (validateInputString(inputMapSource)){
            newOptions.mapSource = inputMapSource;
            if (inputMapSource == 'mapQuestAerial' || inputMapSource == 'mapQuestOsm'){
                newOptions.baseUrl = (inputMapSource == 'mapQuestAerial') ?
                    defaults.providerUrls.mapQuestAerial :
                    defaults.providerUrls.mapQuestOsm;    
                newOptions.mapSourceSuffix = '.jpg';
                newOptions.xBeforeY = true;  
                inputValid = true;  
            } 
            else if (inputMapSource == 'arcGis'){
                newOptions.baseUrl = defaults.providerUrls.arcGis;
                newOptions.mapSourceSuffix = '';
                newOptions.xBeforeY = false;
                inputValid = true; 
            }
        }

        if (!inputValid){
            console.log("Invalid host name (i.e., 'mapQuestAerial','mapQuestOsm)");
        }
    }

    return {
        run: run,
        setInputCoordinates: setInputCoordinates,
        getInputCoordinates: function(){
            return newOptions.inputCoordinates;
        },
        setOptions: function(inputOptions){
            newOptions = override(newOptions, inputOptions, true);
        },
        getOptions: function(){
            return newOptions;
        },
        setUrlByMapProvider: setUrlByMapProvider       
    };
};
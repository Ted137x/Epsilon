import {animationData, addPolygon, addPointToPolygon, programState} from "./states.js";
const div = document.getElementById("editor");



var canvasSize = 400;




export function editorCanvas(p){

    p.setup = () => {
        if (div.clientWidth > div.clientHeight){
            canvasSize = div.clientHeight;} else{
            canvasSize = div.clientWidth;}
        p.createCanvas(canvasSize, canvasSize);
        
    
    }




    p.draw = () => {
        p.background(0);
        p.noFill();
        p.stroke(255);
        p.strokeWeight(0.2);
        p.circle(p.width/2, p.height/2, p.width);



    }



    p.windowResized = () => {
        if (div.clientWidth > div.clientHeight){
            canvasSize = div.clientHeight;
        } else{
            canvasSize = div.clientWidth;
        }
        p.resizeCanvas(canvasSize, canvasSize);
    }
}


import {animationData, addPolygon, addPointToPolygon, programState} from "./states.js";
const div = document.getElementById("editor");



var canvasSize = 400;




export function editorCanvas(p){

    p.setup = function(){
        if (div.clientWidth > div.clientHeight){
            canvasSize = div.clientHeight;} else{
            canvasSize = div.clientWidth;}
        p.createCanvas(canvasSize, canvasSize);
        

        addPolygon();     
    }




    p.draw = function(){
        p.background(0);
        p.noFill();
        p.stroke(255);
        p.strokeWeight(0.2);
        p.circle(p.width/2, p.height/2, p.width);

        console.log(animationData)

    }

    p.mouseClicked = () => {
        addPointToPolygon(animationData.polygons[0], p.mouseX - p.width/2, p.mouseY - p.height/2, -100, programState.time)
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


// function mouseClicked(event){
//   addPointToPolygon(animationData.polygons[0], mouseX - width/2, mouseY - height/2, -100, programState.time)
// }
const div = document.getElementById("zoombar");
import { animationData } from "./states.js";






class timelinePolygon {
    constructor (toggle = false, points = []){
        this.toggle = toggle;
        this.points = points;
    }
}


const timelineData = {
    objects: []
};






export function timelineZoomCanvas(p){
    p.setup = () => {
        p.createCanvas(div.clientWidth, 45);
        p.background(25);
    }

    
    p.draw = () => {
        p.background(25);
    }




    p.windowResized = () => {
        p.resizeCanvas(div.clientWidth, 45);
    }
}






export function timelineFrameCanvas(p){
    p.setup = () => {
        p.createCanvas(div.clientWidth-20, 1000);
        p.background(35);

    }

    
    p.draw = () => {
        p.background(35);


    }




    p.windowResized = () => {
        p.resizeCanvas(div.clientWidth-20, 2000);
    }
}









function reloadTimeline (){
    timelineData.objects = [];
    for (let i = 0; i < animationData.polygons.length; i++){
        timelineData.objects.push(new timelinePolygon(true, animationData.polygons[i].animationPoints));
    }

}
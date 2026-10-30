import {Point3D, Point2D, project, print2DPolygon, inverseX, cubicCurveProgress, animate} from "./functions.js";
import { animationData } from "./states.js";



const cube = [
    new Point3D(-100, -100, -100),
    new Point3D( 100, -100, -100),
    new Point3D( 100,  100, -100),
    new Point3D(-100,  100, -100),
    new Point3D(-100, -100,  100),
    new Point3D( 100, -100,  100),
    new Point3D( 100,  100,  100),
    new Point3D(-100,  100,  100)
];

let screenCube = [];




const FOV = 250;
const size = 150;


let showCube = false;

let angleX = 0;
let angleY = 0;
let angleZ = 0;

let time = 0;
let animationTime = 0;







export function emulatorCanvas(p){
    p.setup = function(){
        p.createCanvas(240, 240);
    }



    p.draw = function(){

        p.background(0);
        p.stroke(255, 255, 0);
        p.fill(255,255,0,200);

        time += p.deltaTime/1000;
        animationTime = time % animationData.duration;
        p.text(animationTime.toFixed(2), 10, 20);
        
        let mouse_x = p.mouseX;
        let mouse_y = p.mouseY;

        if (showCube){
            angleX = 0.7853 - (mouse_y/240) * 1.5707;
            angleY = 0.7853 - (mouse_x/240) * 1.5707;
        }
          

          


        
		for (let i = 0; i < animationData.polygons.length; i++)
		{
            p.stroke(animationData.polygons[i].colorKeyframes[0]);
            p.strokeWeight(0.6);
			print2DPolygon(p, project(animate(animationData.polygons[i], animationTime), 
			angleX, angleY, angleZ, size, FOV), animationData.polygons[i].colorKeyframes[0]);
		}






          

        if (showCube) {
            screenCube = project(cube, angleX, angleY, angleZ, size, FOV);
            p.stroke(255,255,255, 100);
            p.line(screenCube[0].x, screenCube[0].y, screenCube[1].x, screenCube[1].y);
            p.line(screenCube[1].x, screenCube[1].y, screenCube[2].x, screenCube[2].y);
            p.line(screenCube[2].x, screenCube[2].y, screenCube[3].x, screenCube[3].y);
            p.line(screenCube[3].x, screenCube[3].y, screenCube[0].x, screenCube[0].y);

            p.line(screenCube[4].x, screenCube[4].y, screenCube[5].x, screenCube[5].y);
            p.line(screenCube[5].x, screenCube[5].y, screenCube[6].x, screenCube[6].y);
            p.line(screenCube[6].x, screenCube[6].y, screenCube[7].x, screenCube[7].y);
            p.line(screenCube[7].x, screenCube[7].y, screenCube[4].x, screenCube[4].y);

            p.line(screenCube[0].x, screenCube[0].y, screenCube[4].x, screenCube[4].y);
            p.line(screenCube[1].x, screenCube[1].y, screenCube[5].x, screenCube[5].y);
            p.line(screenCube[2].x, screenCube[2].y, screenCube[6].x, screenCube[6].y);
            p.line(screenCube[3].x, screenCube[3].y, screenCube[7].x, screenCube[7].y);
        }

    }

	p.mousePressed = () => {
		if (p.mouseX > 0 && p.mouseX < 240 && p.mouseY > 0 && p.mouseY < 240){
			showCube = true;
		}
	}
	p.mouseReleased = () => {
		showCube = false;
	}

}






















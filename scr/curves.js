import {curvePoints, inverseX, cubicCurveProgress} from "./functions.js";


export function curvesCanvas(p){
    p.setup = function(){
        p.createCanvas(240, 240);
    }


    let screenCurve = new curvePoints(0.3, 0.3, 0.7, 0.7);



    p.draw = function() {
        p.background(50);
        p.strokeWeight(1);
        p.stroke(255, 255, 255, 255);
        p.line(20,20,220,20);
        p.line(220,20,220,220);
        p.line(220,220,20,220);
        p.line(20,220,20,20);




        p.strokeWeight(2)
        p.stroke(200,158,2)
        for (let pseudoTime = 0; pseudoTime <= 1; pseudoTime += 0.01)
        {
            let x = pseudoTime;
            let y = cubicCurveProgress(0, 1, screenCurve, pseudoTime);

            p.point(x*200+20, -y*200+220);
        }
        p.strokeWeight(1)
        p.stroke(255)
        




        
        p.fill(255);
        if(p.dist(p.mouseX, p.mouseY, screenCurve.x1*200+20, -screenCurve.y1*200+220) <= 5 || p.dist(p.mouseX, p.mouseY, screenCurve.x2*200+20, -screenCurve.y2*200+220) <= 7){
            p.fill(100);
        }
        p.circle(screenCurve.x1*200+20, -screenCurve.y1*200+220, 7);
        p.circle(screenCurve.x2*200+20, -screenCurve.y2*200+220, 7);
        p.strokeWeight(0.3);
        p.line(20, 220, screenCurve.x1*200+20, -screenCurve.y1*200+220);
        p.line(220, 20, screenCurve.x2*200+20, -screenCurve.y2*200+220);
    }


    p.mouseDragged = function(){
        if(p.dist(p.mouseX, p.mouseY, screenCurve.x1*200+20, -screenCurve.y1*200+220) <= 7){
            screenCurve.x1 = (p.mouseX-20)/200;
            screenCurve.y1 = (p.mouseY-220)/(-200);
        }
        if(p.dist(p.mouseX, p.mouseY, screenCurve.x2*200+20, -screenCurve.y2*200+220) <= 7){
            screenCurve.x2 = (p.mouseX-20)/200;
            screenCurve.y2 = (p.mouseY-220)/(-200);
        }
    }





    p.doubleClicked = function(){
        if (p.mouseX > 0 && p.mouseX < 240 && p.mouseY > 0 && p.mouseY < 240){

            //screenCurve = (0.3, 0.3, 0.7, 0.7);
            screenCurve.x1 = 0.3;
            screenCurve.y1 = 0.3;
            screenCurve.x2 = 0.7;
            screenCurve.y2 = 0.7;
        }
    }


}










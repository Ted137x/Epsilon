export function curvesCanvas(p){
  p.setup = function(){
    p.createCanvas(240, 240);
  }

  let point1 = { x: 0.3, y: 0.3 };
  let point2 = { x: 0.7, y: 0.7 };


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
        let y = cubicCurveAnimTime(0, 1, point1.x, point1.y, point2.x, point2.y, pseudoTime);

        p.point(x*200+20, -y*200+220);
    }
    p.strokeWeight(1)
    p.stroke(255)
    




    
    p.fill(255);
    if(p.dist(p.mouseX, p.mouseY, point1.x*200+20, -point1.y*200+220) <= 5 || p.dist(p.mouseX, p.mouseY, point2.x*200+20, -point2.y*200+220) <= 7){
      p.fill(100);
    }
    p.circle(point1.x*200+20, -point1.y*200+220, 7);
    p.circle(point2.x*200+20, -point2.y*200+220, 7);
    p.strokeWeight(0.3);
    p.line(20, 220, point1.x*200+20, -point1.y*200+220);
    p.line(220, 20, point2.x*200+20, -point2.y*200+220);
  }


  p.mouseDragged = function(){
    if(p.dist(p.mouseX, p.mouseY, point1.x*200+20, -point1.y*200+220) <= 7){
      point1.x = (p.mouseX-20)/200;
      point1.y = (p.mouseY-220)/(-200);
    }
    if(p.dist(p.mouseX, p.mouseY, point2.x*200+20, -point2.y*200+220) <= 7){
      point2.x = (p.mouseX-20)/200;
      point2.y = (p.mouseY-220)/(-200);
    }
  }





  p.doubleClicked = function(){
    if (p.mouseX > 0 && p.mouseX < 240 && p.mouseY > 0 && p.mouseY < 240){
      point1 = {x: 0.3,y: 0.3};
      point2 = {x: 0.7,y: 0.7};
    }
  }


}
















// takes real time and returns a pseudo time that has the curves effect
function cubicCurveAnimTime (startTime, endTime, ax, ay, bx, by, time)
{
    if (time <= startTime || endTime <= time)
    {return time;}

    let progress = (time - startTime) / (endTime - startTime);
    let t = inverseX(ax, ay, bx, by, progress);
    let y = 3*(1-t)*(1-t)*t*ay + 3*(1-t)*t*t*by + t*t*t;


    return startTime + y*(endTime - startTime);
}


function inverseX(p1x, p1y, p2x, p2y, targetX)
{
    let t = targetX;

    for (let i = 0; i < 5; ++i)
    {
        let u = 1 - t;

        // Calculate X at the current t
        let x =
            3 * u * u * t * p1x +
            3 * u * t * t * p2x +
            t * t * t;

        // Derivative of X(t)
        let dx =
            3 * u * u * p1x +
            6 * u * t * (p2x - p1x) +
            3 * t * t * (1 - p2x);

        // Newton-Raphson correction
        t -= (x - targetX) / dx;
    }

    return t;
}






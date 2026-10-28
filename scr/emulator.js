import {Point3D, Point2D, project, print2DPolygon} from "./functions.js";


class animatedObject {
  constructor(a = [], b = []){
    this.frames = a;
    this.frameTimes = b;
  }
}





let testAnimatedObject = new animatedObject(
  [
    [
      new Point3D(-100, 100, -100),
      new Point3D(-100, 50, -100),
      new Point3D(-50, 50, -100),
      new Point3D(-50, 100, -100),
    ],
    [
      new Point3D(0, 0, -100),
      new Point3D(-50, 0, -100),
      new Point3D(-90, -50, -100),
      new Point3D(40, -80, -100),

    ]
  ],
  [1,4]
);

const testPolygon = [
  // new Point3D(-80, 70, -100),
  // new Point3D(-80, 0, -100),
  // new Point3D(-100, -50, -100),
  // new Point3D(60, -80, -100),
  // new Point3D(90, 30, -100),
  // new Point3D(120, 100, -100)
];

let screenTestPolygon = Array.from(
  { length: 4 },
  () => new Point2D()
);

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

let screenCube = Array.from(
  { length: 8 },
  () => new Point2D()
);




export function emulatorCanvas(p){
  p.setup = function(){
    p.createCanvas(240, 240);
  }

  const FOV = 250;
  const size = 150;

  let showCube = false;

  let angleX = 0;
  let angleY = 0;
  let angleZ = 0;

  let time = 0;


  p.mousePressed = function(){
    testPolygon.push(new Point3D(p.mouseX-120, -p.mouseY +120, -100)); 
  }

  p.draw = function(){

    p.background(0);
    p.stroke(255,255,255);
    p.fill(255,255,0,200);

    time += p.deltaTime/1000;
    p.text(time, 10, 20)
    
    let mouse_x = p.mouseX;
    let mouse_y = p.mouseY;

    if (showCube){
      angleX = 0.7853 - (mouse_y/240) * 1.5707;
      angleY = 0.7853 - (mouse_x/240) * 1.5707;
    }
    


    print2DPolygon(p, project(animate(testAnimatedObject, time), angleX, angleY, angleZ, size, FOV));


    
    
    screenTestPolygon = project(testPolygon, angleX, angleY, angleZ, size, FOV);
    for (let i = 0; i < screenTestPolygon.length; i++){
      p.line(screenTestPolygon[i].x, screenTestPolygon[i].y, 
          screenTestPolygon[(i+1) % screenTestPolygon.length].x,
          screenTestPolygon[(i+1) % screenTestPolygon.length].y);
    }

    if(showCube){
      print2DPolygon(p, screenTestPolygon);  
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



  p.mousePressed = function(){
    if (p.mouseX > 0 && p.mouseX < 240 && p.mouseY > 0 && p.mouseY < 240){
      testPolygon.push(new Point3D(p.mouseX-120, -p.mouseY +120, -100)); 
    }
  }






  p.keyPressed = function() {
    if(p.key === 'r'){
      showCube = !showCube;
    }
  }





}










function animate (animated_object, time){
  let result = [];
  for (let i = 0; i < animated_object.frames.length-1; i++){
    if (animated_object.frameTimes[i] < time){
      if (animated_object.frameTimes[i+1] > time){
        for (let j = 0; j < animated_object.frames[i].length; j++){
          result.push(new Point3D(animated_object.frames[i][j].x + ((animated_object.frames[i+1][j].x - animated_object.frames[i][j].x) * ((time - animated_object.frameTimes[i]) / (animated_object.frameTimes[i+1] - animated_object.frameTimes[i]))),
                                 animated_object.frames[i][j].y + ((animated_object.frames[i+1][j].y - animated_object.frames[i][j].y) * ((time - animated_object.frameTimes[i]) / (animated_object.frameTimes[i+1] - animated_object.frameTimes[i]))),
                                 animated_object.frames[i][j].z + ((animated_object.frames[i+1][j].z - animated_object.frames[i][j].z) * ((time - animated_object.frameTimes[i]) / (animated_object.frameTimes[i+1] - animated_object.frameTimes[i])))));  
        }
        return result;
      }      
    }
    else{
      return [];
    }
  }
  return [];
}











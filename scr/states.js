

class animationPoint {
    constructor() {
        this.x = [];
        this.frameTimesX = [];
        this.curvesX = [];

        this.y = [];
        this.frameTimesY = [];
        this.curvesY = [];

        this.z = [];
        this.frameTimesZ = [];
        this.curvesZ = [];
    }
}

class animationPolygon {
    constructor() {
        this.animationPoints = [];
        this.colorKeyframes = [];
        this.colorKeyframeTimes = [];
    }
}



// The main project file that contains every object on the screen
export const animationData = {
    polygons: [],
    duration: 5
};




export function addPolygon (a = [255], b = [0]){
  let p = new animationPolygon;
  p.colorKeyframes = a;
  p.colorKeyframeTimes = b;
  animationData.polygons.push(p);
}


export function addPointToPolygon (polygon, x, y, z, time){
  let p = new animationPoint;
  p.x[0] = x;
  p.frameTimesX[0] = time;

  p.y[0] = y;
  p.frameTimesY[0] = time;

  p.z[0] = z;
  p.frameTimesZ[0] = time;
  
  polygon.animationPoints.push(p);
}






function makeTest1() {
  const polygon = new animationPolygon();
  polygon.colorKeyframes.push("#9C4D00");
  polygon.colorKeyframeTimes.push(0);
  const pi = Math.PI;

  for (let i = 0; i < 60; ++i) {
    const angle = 2 * pi * i / 60;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const point = new animationPoint();

    point.x = [-45 + 22 * cosAngle, 45 + 16 * cosAngle];
    point.frameTimesX = [1, 4];
    point.curvesX = [{ x1: 0.60, y1: 0.06, x2: 0.98, y2: 0.54 }];

    point.y = [18 * sinAngle, 28 * sinAngle];
    point.frameTimesY = [1, 4];
    point.curvesY = [{ x1: 0.60, y1: 0.06, x2: 0.98, y2: 0.54 }];

    point.z = [-100, -100];
    point.frameTimesZ = [1, 4];
    point.curvesZ = [{ x1: 0.60, y1: 0.06, x2: 0.98, y2: 0.54 }];

    polygon.animationPoints.push(point);
  }

  return polygon;
}

animationData.polygons.push(makeTest1());


// This part is not going to be saved and just helps the program work
export const programState = {
  time: 0
};











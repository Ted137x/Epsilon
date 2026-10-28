class curvePoints {
    constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }
}

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
    polygons: []
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












export const programState = {
  time: 0
};












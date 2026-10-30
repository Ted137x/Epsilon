export class curvePoints {
    constructor(x1 = 0.3, y1 = 0.3, x2 = 0.7, y2 = 0.7) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }
}


export class Point3D {
  constructor(x=0, y=0, z=0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

export class Point2D {
  constructor(x=0, y=0) {
    this.x = x;
    this.y = y;
  }
}



// Rotate a 3D point around the X axis
function rotate_x(p, angle)
{
  let y = p.y * Math.cos(angle) - p.z * Math.sin(angle);
  let z = p.y * Math.sin(angle) + p.z * Math.cos(angle);


  return new Point3D(p.x, y, z);
}


// Rotate a 3D point around the Y axis
function rotate_y(p, angle)
{
    let x = p.x * Math.cos(angle) + p.z * Math.sin(angle);
    let z = -p.x * Math.sin(angle) + p.z * Math.cos(angle);


    return new Point3D(x, p.y, z);
}


// Rotate a 3D point around the Z axis
function rotate_z(p, angle)
{
    let x = p.x * Math.cos(angle) - p.y * Math.sin(angle);
    let y = p.x * Math.sin(angle) + p.y * Math.cos(angle);

    return new Point3D(x, y, p.z);
}


// Takes an array of Point3Ds then rotates it across 3th 
// demention and returns a 2D projection of those 3D
// points as an array of Point2Ds .

export function project (arr, ax, ay, az, size, FOV) {
  let result = [];

  for (let i = 0; i < arr.length; i++){

    let p = new Point3D(arr[i].x, arr[i].y, arr[i].z);
    p = rotate_x(p, ax);
    p = rotate_y(p, ay);
    p = rotate_z(p, az);
    
    result[i] = new Point2D(120 + (p.x / (p.z + FOV)) * size,
                           120 - (p.y / (p.z + FOV)) * size)
  }

  return result;
  
}





// tells if the corner is an ear to cut
function cross_(a, b, c)
{
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}


function isPointInTriangle (p, a, b, c)
{
    let c1 = cross_(a, b, p);
    let c2 = cross_(b, c, p);
    let c3 = cross_(c, a, p);

    return (c1 > 0 && c2 > 0 && c3 > 0) || (c1 < 0 && c2 < 0 && c3 < 0);
}





export function print2DPolygon(p, polygon, color){
  let pseudoPolygon = [...polygon]; 
  let num = 0;
  p.fill(color);
  while(true){
    if(pseudoPolygon.length > 3){
      let current = num % pseudoPolygon.length;
      let next = (num + 1) % pseudoPolygon.length;
      let nextOfNext = (num + 2) % pseudoPolygon.length;

      if (cross_(pseudoPolygon[current], pseudoPolygon[next], pseudoPolygon[nextOfNext]) <= 0){
        let a = true;
        for(let j = 0; j < pseudoPolygon.length; j++){
          if (!(j === next || j === current || j === nextOfNext)){
            if (isPointInTriangle(pseudoPolygon[j],
                                  pseudoPolygon[current],
                                  pseudoPolygon[next],
                                  pseudoPolygon[nextOfNext]))
            {
              a = false;
            }
          }
        }
        if (a){
          p.triangle(pseudoPolygon[current].x, pseudoPolygon[current].y,
                  pseudoPolygon[next].x, pseudoPolygon[next].y,
                  pseudoPolygon[nextOfNext].x, pseudoPolygon[nextOfNext].y);
          pseudoPolygon.splice(next, 1);
        }
      }
      
    } else if(pseudoPolygon.length === 3){
      p.triangle(pseudoPolygon[0].x, pseudoPolygon[0].y, pseudoPolygon[1].x, pseudoPolygon[1].y, pseudoPolygon[2].x, pseudoPolygon[2].y);
      pseudoPolygon.splice(0, 3);
    } else{
      break;
    }
    num++;
  }
}













export function inverseX(a, targetX)
{
    let t = targetX;

    for (let i = 0; i < 5; ++i)
    {
        let u = 1 - t;

        // Calculate X at the current t
        let x =
            3 * u * u * t * a.x1 +
            3 * u * t * t * a.x2 +
            t * t * t;

        // Derivative of X(t)
        let dx =
            3 * u * u * a.x1 +
            6 * u * t * (a.x2 - a.x1) +
            3 * t * t * (1 - a.x2);

        // Newton-Raphson correction
        t -= (x - targetX) / dx;
    }

    return t;
}







export function cubicCurveProgress (startTime, endTime, a, time)
{
    if (time <= startTime || endTime <= time)
    {return time;}

    let progress = (time - startTime) / (endTime - startTime);
    let t = inverseX(a, progress);
    let y = 3*(1-t)*(1-t)*t*a.y1 + 3*(1-t)*t*t*a.y2 + t*t*t;


    //return startTime + y*(endTime - startTime);
    return y; // in this version it returns no time and just progress (number between 0 and 1) made until given time
}













export function animate (p, time)  //takes animationPolygon
{
    let result = [];
    for(let i = 0; i < p.animationPoints.length; i++)
    {
        if (!(time > p.animationPoints[i].frameTimesX[p.animationPoints[i].frameTimesX.length-1] || time < p.animationPoints[i].frameTimesX[0]))
        {
            let d = new Point3D;
            let frameX = -1;
            for (let k = 0; k < (p.animationPoints[i].frameTimesX.length-1); k++)
            {
                if (time < p.animationPoints[i].frameTimesX[k+1])
                {
                    if (p.animationPoints[i].frameTimesX[k] < time)
                    {
                        frameX = k;
                    }
                }
            }
            d.x = p.animationPoints[i].x[frameX] + ((p.animationPoints[i].x[frameX+1] - p.animationPoints[i].x[frameX]) * cubicCurveProgress(p.animationPoints[i].frameTimesX[frameX],
            p.animationPoints[i].frameTimesX[frameX+1], p.animationPoints[i].curvesX[frameX], time));

            




            let frameY = -1;
            for (let k = 0; k < (p.animationPoints[i].frameTimesY.length-1); k++)
            {
                if (time < p.animationPoints[i].frameTimesY[k+1])
                {
                    if (p.animationPoints[i].frameTimesY[k] < time)
                    {
                        frameY = k;
                    }
                }
            }
            d.y = p.animationPoints[i].y[frameY] + ((p.animationPoints[i].y[frameY+1] - p.animationPoints[i].y[frameY]) * cubicCurveProgress(p.animationPoints[i].frameTimesY[frameY],
            p.animationPoints[i].frameTimesY[frameY+1], p.animationPoints[i].curvesY[frameY], time));






            let frameZ = -1;
            for (let k = 0; k < (p.animationPoints[i].frameTimesZ.length-1); k++)
            {
                if (time < p.animationPoints[i].frameTimesZ[k+1])
                {
                    if (p.animationPoints[i].frameTimesZ[k] < time)
                    {
                        frameZ = k;
                    }
                }
            }
            d.z = p.animationPoints[i].z[frameZ] + ((p.animationPoints[i].z[frameZ+1] - p.animationPoints[i].z[frameZ]) * cubicCurveProgress(p.animationPoints[i].frameTimesZ[frameZ],
            p.animationPoints[i].frameTimesZ[frameZ+1], p.animationPoints[i].curvesZ[frameZ], time));


            result.push(d);
        }
    }

    return result;
}







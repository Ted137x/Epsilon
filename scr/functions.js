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





export function print2DPolygon(p, polygon){
  let pseudoPolygon = [...polygon]; 
  let num = 0;
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
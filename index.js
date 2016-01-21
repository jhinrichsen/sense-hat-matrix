// Find our matrix in all available framebuffers

"use strict";
let rotation = 0;

const fsp = require('fs-promise'),
  glob = require('glob-promise'),
  path = require('path'),
  Stream = require('streamjs'),
  rotateMatrix = require('rotate-matrix'),

  // the framebuffer's name file
  namefile = framebuffer => path.join(framebuffer, 'name'),

  // Linux file spec for framebuffers
  prospects = glob('/sys/class/graphics/fb*'),

  // predicte: has a name file
  // Promise hasNamefile = dir => fsp.statSync(namefile(dir)).then(stat => stat.isFile()),
  // exists() is deprecated in favour of stat(), but stat throws an Error, which i cannot
  // handle taking my limited Javascript into consideration
  // hasNamefile = dir => fsp.statSync(namefile(dir)),
  hasNamefile = dir => fsp.existsSync(namefile(dir)),

  // Predicate: framebuffer is a Sense HAT LED matrix
  isSenseHatMatrix = dir => {
    // Promise return fsp.readFileSync(namefile(dir)).then(buf => 'RPi-Sense FB\n' === b.toString());
    const s = fsp.readFileSync(namefile(dir)).toString().trim();
    // Ignore any trailing EOL
    const p = 'RPi-Sense FB' === s;
    return p;
  },

  // Return a /dev/<device> name for a given framebuffer
  devname = path => `/dev/${path.split('/').reverse()[0]}`,

  // Returns an Optional, which is also called a Maybe in other languages
  fb = prospects.then(a => {
    let r = Stream(a)
      .filter(hasNamefile)
      .filter(isSenseHatMatrix)
      .findFirst();
    return r;
  }),

  // Decodes 16 bit RGB565 into list [R,G,B]
  unpack = n => {
    let r = (n & 0xF800) >> 11,
      g = (n & 0x7E0) >> 5,
      b = (n & 0x1F),
      rc = [ r << 3, g << 2, b << 3 ];
    return rc;
  },

  // Encodes list [R, G, B] into 16 bit RGB565
  pack = rgb => {
    if (rgb.length != 3) throw new Error(`length = ${rgb.lenth} violates length = 3`);
    let r = (rgb[0] >> 3) & 0x1F,
      g = (rgb[1] >> 2) & 0x3F,
      b = (rgb[2] >> 3) & 0x1F,
      bits = (r << 11) + (g << 5) + b;
    return bits;
  },
  
  pixMap0 =  [[ 0,  1,  2,  3,  4,  5,  6,  7],
              [ 8,  9, 10, 11, 12, 13, 14, 15],
              [16, 17, 18, 19, 20, 21, 22, 23],
              [24, 25, 26, 27, 28, 29, 30, 31],
              [32, 33, 34, 35, 36, 37, 38, 39],
              [40, 41, 42, 43, 44, 45, 46, 47],
              [48, 49, 50, 51, 52, 53, 54, 55],
              [56, 57, 58, 59, 60, 61, 62, 63]],
            
  pixMap90  = rotateMatrix(pixMap0),
  
  pixMap180 = rotateMatrix(pixMap90),
  
  pixMap270 = rotateMatrix(pixMap180),
  
  pixMap = {
      	      0: pixMap0,
             90: pixMap90,
            180: pixMap180,
            270: pixMap270
        },
  
  setRotation = (r, redraw) => {
  //Sets the LED matrix rotation for viewing, adjust if the Pi is upside
  //down or sideways. 0 is with the Pi HDMI port facing downwards
    
    //defaults
    if (r === undefined) r = 0;
    if (redraw === undefined) redraw = true;
    
    if (r in pixMap){
      if (redraw){
        let pixelList = getPixels();
        rotation = r;
        setPixels(pixelList);
      }else{
        rotation = r;
      }
    }else{
      throw new Error('Rotation must be 0, 90, 180 or 270 degrees');
    }
  },
  
  // Map (x, y) into rotated absolute byte position
  pos = (x, y) => pixMap[rotation][y][x] * 2,

  // Returns a list of [R,G,B] representing the pixel specified by x and y
  // on the LED matrix. Top left = 0,0 Bottom right = 7,7
  getPixel = (fb, x, y) => {
    if (x < 0 || x > 7) throw new Error(`x=${x} violates 0 <= x <= 7`);
    if (y < 0 || y > 7) throw new Error(`y=${y} violates 0 <= y <= 7`);
    // Two bytes per pixel in fb memory, 16 bit RGB565
    const fd = fsp.openSync(fb, 'r');
    // fread() supports no sync'd version, so read in all 8 x 8 x 2 bytes in one shot
    const buf = fsp.readFileSync(fd);
    fsp.closeSync(fd);
    const n = buf.readUInt16LE(pos(x, y));
    return unpack(n);
  },
  
  setPixel = (fb, x, y, rgb) => {
    if (x < 0 || x > 7) throw new Error(`x=${x} violates 0 <= x <= 7`);
    if (y < 0 || y > 7) throw new Error(`y=${y} violates 0 <= y <= 7`);
    rgb.map(col => {
      if (col < 0 || col > 255) throw new Error(`RGB color ${rgb} violates` +
        ` [0, 0, 0] < RGB < [255, 255, 255]`);
      return col;
    });

    let fd = fsp.openSync(fb, 'w'),
        buf = new Buffer(2),
        n = pack(rgb);
    buf.writeUInt16LE(n);
    fsp.writeSync(fd,
      buf, 0, buf.length,
      pos(x, y),
      // Wait for write to return
      (error, written, _) => console.log(`Wrote ${written} bytes`));
    fsp.closeSync(fd);
  },
  
  // Accepts a list containing 64 smaller lists of [R,G,B] pixels and
  // updates the LED matrix. R,G,B elements must intergers between 0
  // and 255
  setPixels = (fb, pixelList) => {
    if (pixelList.length != 64) throw new Error('Pixel lists must have 64 elements');
    
    pixelList.forEach((fb, pix, index) => {
      let x = Math.floor(index/8),
          y = index % 8;
          
      setPixel(fb, x, y, pix);
    });
  },

  //  Returns a list containing 64 smaller lists of [R,G,B] pixels
  //  representing what is currently displayed on the LED matrix
  getPixels = (fb) => {
    let pixelList=[];
    for (let row = 0; row < 8; row++){
      for (let col = 0; col < 8; row++){
        pixelList.push(getPixel(fb, col, row));
      }
    }
    return pixelList;
  },

  clear = fb => {
    for (let y = 8; --y >= 0; ) {
      for (let x = 8; --x >= 0; ) {
        setPixel(fb, x, y, [0, 0, 0]);
      }
    }
  },
  
  // Flip LED matrix horizontal
  flipH = (fb, redraw) =>{
    let pixelList = getPixels(fb),
        flipped = [];
    
    while(pixelList.Length){
      flipped.concat(pixelList.splice(8).reverse());
    }
    if (redraw) setPixels(fb, flipped);
    return flipped;
  },
  
   // Flip LED matrix vertical
  flipV = (fb,redraw) =>{
    let pixelList = getPixels(fb),
        flipped = [];
    
    while(pixelList.Length){
      flipped.concat(pixelList.splice(pixelList.Length-8,8));
    }
    if (redraw) setPixels(fb, flipped);
    return flipped;
  },
  
  rc = fb.then(a => {
    if (a.isPresent()) {
      const led = devname(a.get());
      console.log(`Found framebuffer ${led}`);
      return led;
    } else {
      console.log('Cannot find a Raspberry Pi Sense HAT matrix LED!' +
	      'Are we running on a Pi?');
      return null;
    }
  }),

  random = (low, high) => Math.floor(Math.random() * (high - low) + low),

  rrc = rc.then(fb => {
    console.log(`Pixel (0,0) = ${getPixel(fb, 0, 0)}`);
    for (let n = 1; --n >= 0; ) {
      for (let y = 8; --y >= 0; ) {
        for (let x = 8; --x >= 0; ) {
          setPixel(fb, x, y, [random(0, 255), random(0, 255), random(0, 255)]);
        }
      }
    }
    console.log(`Pixel (0,0) = ${getPixel(fb, 0, 0)}`);
  });
  
// EOF

// Find our matrix in all available framebuffers

"use strict";

const fsp = require('fs-promise'),
  glob = require('glob-promise'),
  path = require('path'),
  Stream = require('streamjs'),

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
  rgb = n => {
    let r = (n & 0xF800) >> 11,
      g = (n & 0x7E0) >> 5,
      b = (n & 0x1F),
      rc = [ r << 3, g << 2, b << 3 ];
    return rc;
  },

  // Returns a list of [R,G,B] representing the pixel specified by x and y
  // on the LED matrix. Top left = 0,0 Bottom right = 7,7
  getPixel = (fb, x, y) => {
    if (x < 0 || x > 7) throw new Error(`x=${x} violates 0 <= x <= 7`);
    if (y < 0 || y > 7) throw new Error(`y=${y} violates 0 <= y <= 7`);
    // TODO support rotation
    
    // Two bytes per pixel in fb memory, 16 bit RGB565
    const fd = fsp.openSync(fb, 'r');
    // fread() supports no sync'd version, so read in all 8 x 8 x 2 bytes in one shot
    const buf = fsp.readFileSync(fd);
    const n = buf.readUInt16BE(y * 8 + x);
    return rgb(n);
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

  rrc = rc.then(fb => {
    console.log(`Pixel (0,0) = ${getPixel(fb, 0, 0)}`);
  });
  
// EOF

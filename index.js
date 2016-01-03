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

  // Returns an Optional, which is also called a Maybe in other languages
  fb = prospects.then(a => {
    let r = Stream(a)
      .filter(hasNamefile)
      .filter(isSenseHatMatrix)
      .findFirst();
    return r;
  }),

  rc = fb.then(a => {
    if (a.isPresent()) {
      const led = a.get();
      console.log(`Found framebuffer ${led}`);
      return led;
    } else {
      console.log('Cannot find a Raspberry Pi Sense HAT matrix LED!' +
	      'Are we running on a Pi?');
      return null;
    }
  });
  
// EOF

/* MAJOBELLA · Rostro ilustrado (SVG dibujado, vista frontal centrada)
   Rasgos tomados de la foto de referencia: cabello largo oscuro con raya ligeramente a un lado,
   rostro redondeado de piel cálida, ojos almendrados oscuros con pestañas marcadas,
   lentes redondos de montura oscura, labios llenos en tono rosa, piercing en la nariz
   y cadena dorada fina con corazón.
   Capas separadas para dar profundidad: cabello posterior, cuello, rostro, rasgos y mechones frontales. */
(function (M) {
  const W = 600, H = 720;
  M.FACE_SIZE = { width: W, height: H };

  function eye(cx, cy, s) {
    // s = 1 ojo a la derecha del espectador, -1 a la izquierda
    const X = (dx) => (cx + s * dx).toFixed(1);
    const inner = [X(-31), cy + 5], outer = [X(32), cy - 6];
    const upper = `M${inner[0]} ${inner[1]} C${X(-18)} ${cy - 17} ${X(15)} ${cy - 22} ${outer[0]} ${outer[1]}`;
    const lower = `C${X(18)} ${cy + 11} ${X(-15)} ${cy + 16} ${inner[0]} ${inner[1]}`;
    const id = s > 0 ? 'R' : 'L';
    return `
      <g class="eye" data-cx="${cx}" data-cy="${cy}">
        <clipPath id="eyeclip-${id}"><path d="${upper} ${lower}Z"/></clipPath>
        <path d="${upper} ${lower}Z" fill="#f4ece4"/>
        <g clip-path="url(#eyeclip-${id})">
          <g class="iris" data-cx="${cx}" data-cy="${cy}">
            <circle cx="${cx}" cy="${cy - 1}" r="16" fill="url(#iris)"/>
            <circle cx="${cx}" cy="${cy - 1}" r="6.4" fill="#0d0705"/>
            <circle cx="${(cx + 4).toFixed(1)}" cy="${cy - 6}" r="3.1" fill="#fff" opacity=".92"/>
            <circle cx="${(cx - 4).toFixed(1)}" cy="${cy + 4}" r="1.3" fill="#fff" opacity=".6"/>
          </g>
          <path d="${upper}" fill="none" stroke="#3b2418" stroke-width="7" opacity=".25"/>
        </g>
        <path d="${upper}" fill="none" stroke="#130b07" stroke-width="3.8" stroke-linecap="round"/>
        <path d="M${outer[0]} ${outer[1]} Q${X(35)} ${cy - 9} ${X(40)} ${cy - 14}" fill="none" stroke="#130b07" stroke-width="2.6" stroke-linecap="round"/>
        <g stroke="#130b07" stroke-width="1.4" stroke-linecap="round" fill="none">
          <path d="M${X(4)} ${cy - 16} q${s * 1} -6 ${s * 3} -9"/>
          <path d="M${X(12)} ${cy - 15} q${s * 2} -5 ${s * 5} -8"/>
          <path d="M${X(19)} ${cy - 12} q${s * 3} -5 ${s * 7} -7"/>
          <path d="M${X(25)} ${cy - 8} q${s * 4} -3 ${s * 8} -4"/>
        </g>
        <path d="M${X(-25)} ${cy - 3} C${X(-12)} ${cy - 24} ${X(16)} ${cy - 27} ${X(32)} ${cy - 12}" fill="none" stroke="#8f5539" stroke-width="1.5" opacity=".5"/>
        <path d="M${X(-22)} ${cy + 9} C${X(-8)} ${cy + 15} ${X(12)} ${cy + 13} ${X(25)} ${cy + 3}" fill="none" stroke="#6b4030" stroke-width="1" opacity=".45"/>
      </g>`;
  }

  function lens(cx, cy, id) {
    return `
      <g class="lens">
        <clipPath id="lens-${id}"><ellipse cx="${cx}" cy="${cy}" rx="47" ry="40"/></clipPath>
        <ellipse cx="${cx}" cy="${cy}" rx="47" ry="40" fill="#fff" fill-opacity=".05"/>
        <g clip-path="url(#lens-${id})">
          <rect class="glare" x="${cx - 90}" y="${cy - 60}" width="26" height="140" fill="#fff" opacity=".16" transform="rotate(28 ${cx} ${cy})"/>
        </g>
        <ellipse cx="${cx}" cy="${cy}" rx="47" ry="40" fill="none" stroke="#1a110c" stroke-width="5.2"/>
        <ellipse cx="${cx}" cy="${cy}" rx="44.5" ry="37.5" fill="none" stroke="#5a4136" stroke-width="1" opacity=".5"/>
      </g>`;
  }

  M.drawFace = function (svg) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
    <defs>
      <radialGradient id="skin" cx="50%" cy="40%" r="62%">
        <stop offset="0" stop-color="#ecbc98"/><stop offset=".55" stop-color="#d99d76"/><stop offset="1" stop-color="#b47452"/>
      </radialGradient>
      <linearGradient id="neck" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9694a"/><stop offset=".35" stop-color="#c88a64"/><stop offset="1" stop-color="#d49770"/>
      </linearGradient>
      <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3b281e"/><stop offset=".55" stop-color="#22170f"/><stop offset="1" stop-color="#150e0a"/>
      </linearGradient>
      <linearGradient id="hairSheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8a6450" stop-opacity="0"/><stop offset=".45" stop-color="#8a6450" stop-opacity=".38"/><stop offset=".6" stop-color="#8a6450" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="iris" cx="45%" cy="40%" r="60%">
        <stop offset="0" stop-color="#7a4a2b"/><stop offset=".6" stop-color="#3d2416"/><stop offset="1" stop-color="#150b06"/>
      </radialGradient>
      <linearGradient id="lip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b95769"/><stop offset="1" stop-color="#97404f"/>
      </linearGradient>
      <linearGradient id="lipLow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a84a5d"/><stop offset=".55" stop-color="#c46479"/><stop offset="1" stop-color="#a84c5f"/>
      </linearGradient>
      <radialGradient id="blush" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#d4697c" stop-opacity=".34"/><stop offset=".55" stop-color="#d4697c" stop-opacity=".16"/><stop offset="1" stop-color="#d4697c" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="blouse" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fbf9f6"/><stop offset="1" stop-color="#ece6de"/>
      </linearGradient>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="soft2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
      <filter id="soft1" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2"/></filter>
      <clipPath id="faceclip"><path id="faceShape" d="M300 160 C369 160 422 212 426 292 C431 362 427 426 404 474 C380 522 342 546 300 546 C258 546 220 522 196 474 C173 426 169 362 174 292 C178 212 231 160 300 160Z"/></clipPath>
    </defs>

    <g class="fig">
      <g class="layer hair-back" data-depth="0.25">
        <path d="M312 72 C200 72 126 140 116 250 C108 320 122 370 100 430 C82 480 104 520 96 570 C88 620 70 664 96 700 C106 712 120 716 136 716 L464 716 C480 716 494 712 504 700 C530 664 512 620 504 570 C496 520 518 480 500 430 C478 370 492 320 484 250 C474 140 424 72 312 72Z" fill="url(#hair)"/>
        <path d="M146 300 C132 400 154 470 134 560 C122 610 132 650 118 690 M458 300 C472 400 448 470 468 560 C480 610 470 650 484 690" fill="none" stroke="#6a4a3a" stroke-width="1.6" opacity=".35"/>
      </g>

      <g class="layer body" data-depth="0.3">
        <path d="M254 500 L250 590 C266 610 284 626 300 638 C316 626 334 610 350 590 L346 500Z" fill="url(#neck)"/>
        <ellipse cx="300" cy="530" rx="82" ry="24" fill="#7d4529" opacity=".38" filter="url(#soft)"/>
        <path d="M266 566 C280 594 320 594 334 566" fill="none" stroke="#c9a24a" stroke-width="1.5"/>
        <path d="M300 593 c-3 -5 -9 -2 -6 3 l6 6 l6 -6 c3 -5 -3 -8 -6 -3z" fill="none" stroke="#c9a24a" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M0 720 C30 640 134 594 232 582 C252 608 278 628 300 642 L300 720Z" fill="url(#blouse)"/>
        <path d="M600 720 C570 640 466 594 368 582 C348 608 322 628 300 642 L300 720Z" fill="url(#blouse)"/>
        <path d="M232 582 C252 608 278 628 300 642 M368 582 C348 608 322 628 300 642" fill="none" stroke="#cfc4b6" stroke-width="2"/>
        <path d="M228 598 C208 622 182 640 150 656 M372 598 C392 622 418 640 450 656" fill="none" stroke="#ddd3c6" stroke-width="1.5"/>
      </g>

      <g class="layer face-base" data-depth="0.5">
        <use href="#faceShape" fill="url(#skin)"/>
        <g clip-path="url(#faceclip)">
          <ellipse cx="180" cy="390" rx="28" ry="124" fill="#9c5c3a" opacity=".26" filter="url(#soft)"/>
          <ellipse cx="420" cy="390" rx="28" ry="124" fill="#9c5c3a" opacity=".26" filter="url(#soft)"/>
          <ellipse cx="300" cy="546" rx="120" ry="24" fill="#9c5c3a" opacity=".3" filter="url(#soft)"/>
          <ellipse cx="300" cy="215" rx="80" ry="34" fill="#f5cfae" opacity=".55" filter="url(#soft)"/>
          <ellipse cx="300" cy="372" rx="10" ry="42" fill="#f3c9a6" opacity=".6" filter="url(#soft2)"/>
          <ellipse cx="300" cy="514" rx="22" ry="8" fill="#f0c3a0" opacity=".32" filter="url(#soft2)"/>
          <ellipse cx="230" cy="404" rx="54" ry="34" fill="url(#blush)" filter="url(#soft)"/>
          <ellipse cx="370" cy="404" rx="54" ry="34" fill="url(#blush)" filter="url(#soft)"/>
          <ellipse cx="244" cy="306" rx="38" ry="13" fill="#a35f43" opacity=".28" filter="url(#soft2)"/>
          <ellipse cx="356" cy="306" rx="38" ry="13" fill="#a35f43" opacity=".28" filter="url(#soft2)"/>
        </g>
      </g>

      <g class="layer features" data-depth="0.8">
        <path d="M287 318 C284 350 282 380 280 404" fill="none" stroke="#a5654a" stroke-width="5" opacity=".3" filter="url(#soft2)"/>
        <path d="M313 318 C316 350 318 380 320 404" fill="none" stroke="#a5654a" stroke-width="3" opacity=".16" filter="url(#soft2)"/>
        <ellipse cx="300" cy="410" rx="10" ry="8" fill="#f4d0b0" opacity=".7" filter="url(#soft1)"/>
        <path d="M281 404 C271 412 274 425 288 424" fill="none" stroke="#8a4f34" stroke-width="1.8" stroke-linecap="round" opacity=".42"/>
        <path d="M319 404 C329 412 326 425 312 424" fill="none" stroke="#8a4f34" stroke-width="1.8" stroke-linecap="round" opacity=".42"/>
        <ellipse cx="291" cy="423" rx="5" ry="2.3" fill="#6a3624" opacity=".42" transform="rotate(-14 291 423)"/>
        <ellipse cx="309" cy="423" rx="5" ry="2.3" fill="#6a3624" opacity=".42" transform="rotate(14 309 423)"/>
        <circle cx="321" cy="417" r="2.7" fill="#ead39a" stroke="#b08a43" stroke-width=".8"/>
        <circle cx="320.3" cy="416.2" r=".9" fill="#fff"/>

        <g class="lips" transform="translate(300 0) scale(1.22 1) translate(-300 0)">
          <path d="M262 466 C278 469 290 470 300 470 C310 470 322 469 338 466 C333 484 318 494 300 494 C282 494 267 484 262 466Z" fill="url(#lipLow)"/>
          <path d="M262 466 C272 458 284 450 293 451 C297 451 299 454 300 455 C301 454 303 451 307 451 C316 450 328 458 338 466 C322 468 310 469 300 469 C290 469 278 468 262 466Z" fill="url(#lip)"/>
          <path d="M262 466 C280 470 320 470 338 466" fill="none" stroke="#6b2533" stroke-width="1.7" stroke-linecap="round"/>
          <ellipse cx="306" cy="481" rx="12" ry="4" fill="#fff" opacity=".28" filter="url(#soft1)"/>
          <path d="M286 455 C292 453 296 455 299 458" fill="none" stroke="#fff" stroke-width="1.2" opacity=".35"/>
        </g>
        <ellipse cx="300" cy="440" rx="4" ry="7" fill="#efc3a2" opacity=".35" filter="url(#soft1)"/>

        ${eye(244, 330, -1)}
        ${eye(356, 330, 1)}

        <g class="brow-mount"></g>

        <g class="glasses">
          ${lens(244, 332, 'L')}
          ${lens(356, 332, 'R')}
          <path d="M291 322 C295 312 305 312 309 322" fill="none" stroke="#1a110c" stroke-width="4.5" stroke-linecap="round"/>
          <path d="M197 322 L178 316 M403 322 L422 316" stroke="#1a110c" stroke-width="5" stroke-linecap="round"/>
          <circle cx="201" cy="321" r="2.4" fill="#b9b2aa"/><circle cx="399" cy="321" r="2.4" fill="#b9b2aa"/>
        </g>
      </g>

      <g class="layer hair-front" data-depth="1">
        <path d="M312 148 C262 150 222 178 206 228 C196 262 188 300 184 345 C180 400 186 452 196 496 C208 534 210 568 198 604 C194 636 184 668 194 704 C148 694 118 652 126 600 C136 540 110 500 118 440 C126 380 110 320 118 250 C128 150 198 92 312 90Z" fill="url(#hair)"/>
        <path d="M312 148 C362 150 400 182 412 236 C422 272 422 310 418 350 C414 405 414 452 404 496 C392 534 390 568 402 604 C410 636 416 668 406 704 C452 694 484 652 476 600 C464 540 490 500 482 440 C474 380 490 320 482 250 C472 150 420 92 312 90Z" fill="url(#hair)"/>
        <path d="M214 132 C252 104 300 96 348 102 C374 106 396 116 410 128" fill="none" stroke="#8a6452" stroke-width="12" opacity=".32" filter="url(#soft2)"/>
        <path d="M132 430 C120 480 136 520 128 570 M470 430 C482 480 466 520 474 570" fill="none" stroke="#8a6452" stroke-width="8" opacity=".22" filter="url(#soft2)"/>
        <g fill="none" stroke="#7d5a49" stroke-linecap="round" opacity=".5">
          <path d="M304 96 C248 108 214 150 202 212" stroke-width="1.4"/>
          <path d="M298 112 C246 128 220 170 208 240" stroke-width="1"/>
          <path d="M320 98 C374 112 404 156 414 222" stroke-width="1.4"/>
          <path d="M328 114 C378 132 404 178 410 252" stroke-width="1"/>
          <path d="M150 300 C140 380 158 430 152 500 C148 550 166 590 160 650" stroke-width="1.2"/>
          <path d="M174 420 C170 460 176 500 186 536 C194 570 188 604 178 640" stroke-width="1"/>
          <path d="M452 300 C462 380 446 430 452 500 C456 550 440 590 446 650" stroke-width="1.2"/>
          <path d="M426 420 C430 460 424 500 414 536 C406 570 412 604 422 640" stroke-width="1"/>
        </g>
        <path d="M312 148 C311 128 312 106 314 92" fill="none" stroke="#0d0806" stroke-width="2" opacity=".6"/>
      </g>
    </g>`;

    return {
      root: svg.querySelector('.fig'),
      layers: [...svg.querySelectorAll('.layer')],
      browMount: svg.querySelector('.brow-mount'),
      eyes: [...svg.querySelectorAll('.eye')],
      irises: [...svg.querySelectorAll('.iris')],
      glares: [...svg.querySelectorAll('.glare')],
      hairFront: svg.querySelector('.hair-front'),
    };
  };
})(window.MJB);

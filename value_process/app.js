import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

function RoundedBoxGeometry(width, height, depth, radius, segments, isArrowShape = false) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2 + radius, -height / 2);
    shape.lineTo(width / 2 - radius, -height / 2);

    if (isArrowShape) {
        const arrowLength = height / 2.5;
        const bottomArcCenter = new THREE.Vector2(width / 2 - radius, -height / 2 + radius);
        const topArcCenter = new THREE.Vector2(width / 2 - radius, height / 2 - radius);
        const bottomAngle = -Math.PI / 4;
        const topAngle = Math.PI / 4;
        shape.absarc(bottomArcCenter.x, bottomArcCenter.y, radius, -Math.PI / 2, bottomAngle, false);
        shape.lineTo(width / 2 + arrowLength, 0);
        const arrowBaseTop = new THREE.Vector2(topArcCenter.x + radius * Math.cos(topAngle), topArcCenter.y + radius * Math.sin(topAngle));
        shape.lineTo(arrowBaseTop.x, arrowBaseTop.y);
        shape.absarc(topArcCenter.x, topArcCenter.y, radius, topAngle, Math.PI / 2, false);
    } else {
        shape.absarc(width / 2 - radius, -height / 2 + radius, radius, -Math.PI / 2, 0, false);
        shape.lineTo(width / 2, height / 2 - radius);
        shape.absarc(width / 2 - radius, height / 2 - radius, radius, 0, Math.PI / 2, false);
    }
    
    shape.lineTo(-width / 2 + radius, height / 2);
    shape.absarc(-width / 2 + radius, height / 2 - radius, radius, Math.PI / 2, Math.PI, false);
    shape.lineTo(-width / 2, -height / 2 + radius);
    shape.absarc(-width / 2 + radius, -height / 2 + radius, radius, Math.PI, 3 * Math.PI / 2, false);

    const extrudeSettings = { depth: depth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();
    return geometry;
}

let scene, camera, renderer, controls;
let font;

const BOX_DEPTH = 8;
const TEXT_Z_OFFSET = BOX_DEPTH / 2 + 0.1;

function createBox(xPos,yPos,Label) {
	// --- Box bianco ---
	// 1. Definisco la posizione del box
	const prospettiveBoxPosition = new THREE.Vector3(xPos, yPos, 0);
	// 2. Creo la geometria e il materiale del box (più piccolo e meno profondo)
	const prospettiveBoxGeo = RoundedBoxGeometry(8, 2.5, BOX_DEPTH / 2, 0.3, 8);
	const prospettiveBoxMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
	const prospettiveBox = new THREE.Mesh(prospettiveBoxGeo, prospettiveBoxMat);
	prospettiveBox.position.copy(prospettiveBoxPosition);
	// 3. Creo il testo
	const prospettiveText = createText(Label, 0.4, 0x007bff);
	// Adatto la posizione Z alla nuova profondità ridotta del box
	prospettiveText.position.z = (BOX_DEPTH / 2) / 2 + 0.1; 
	prospettiveBox.add(prospettiveText);
    return prospettiveBox;
}

function createText(text, size = 0.5, color = 0xffffff) {
    const geo = new TextGeometry(text, { font, size, height: 0.2 });
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    geo.center();
    return mesh;
}

function createVolumetricArrow(curve, colors) {
    const tubeRadius = 0.15;
    const tubeGeo = new THREE.TubeGeometry(curve, 256, tubeRadius, 8, false);

    if (Array.isArray(colors)) {
        const count = tubeGeo.attributes.position.count;
        tubeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        const tubeColors = tubeGeo.attributes.color;
        const divisions = curve.getPoints(256).length;

        for (let i = 0; i < count; i++) {
            const percent = i / count;
            const colorIndex = Math.floor(percent * (colors.length - 1));
            const localPercent = (percent * (colors.length - 1)) - colorIndex;
            const col = new THREE.Color().lerpColors(colors[colorIndex], colors[colorIndex + 1], localPercent);
            tubeColors.setXYZ(i, col.r, col.g, col.b);
        }
    }

    const material = new THREE.MeshStandardMaterial({
        color: Array.isArray(colors) ? 0xffffff : colors,
        vertexColors: Array.isArray(colors),
        transparent: true,
        opacity: 0.8
    });
    
    const tubeMesh = new THREE.Mesh(tubeGeo, material);
    scene.add(tubeMesh);

    const endPoint = curve.getPoint(1);
    const tangent = curve.getTangent(1).normalize();
    const coneColor = Array.isArray(colors) ? colors[colors.length - 1] : colors;
    const coneMaterial = new THREE.MeshStandardMaterial({ color: coneColor, transparent: true, opacity: 0.8 });
    const coneGeo = new THREE.ConeGeometry(tubeRadius * 2.5, tubeRadius * 5, 8);
    const coneMesh = new THREE.Mesh(coneGeo, coneMaterial);
    coneMesh.position.copy(endPoint).addScaledVector(tangent, tubeRadius * 2.5);
    coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    scene.add(coneMesh);
}

function createPipeArrow(startPoint, endPoint, color, factor) {
    const bendRadius = 0.75;
    const ySign = Math.sign(endPoint.y - startPoint.y) || 1;
    const bendX = startPoint.x + (endPoint.x - startPoint.x) * factor;
    const p0 = startPoint;
    const p1 = new THREE.Vector3(bendX - bendRadius, startPoint.y, 0);
    const p2_control = new THREE.Vector3(bendX, startPoint.y, 0);
    const p2 = new THREE.Vector3(bendX, startPoint.y + bendRadius * ySign, 0);
    const p3 = new THREE.Vector3(bendX, endPoint.y - bendRadius * ySign, 0);
    const p4_control = new THREE.Vector3(bendX, endPoint.y, 0);
    const p4 = new THREE.Vector3(bendX + bendRadius, endPoint.y, 0);
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(p0, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, p2_control, p2));
    path.add(new THREE.LineCurve3(p2, p3));
    path.add(new THREE.QuadraticBezierCurve3(p3, p4_control, p4));
    path.add(new THREE.LineCurve3(p4, endPoint));
    createVolumetricArrow(path, color);
}

function createCapitalBox(name, position, color) {
    const box = new THREE.Mesh(
        RoundedBoxGeometry(8, 2.5, BOX_DEPTH, 0.5, 8),
        new THREE.MeshStandardMaterial({ color })
    );
    box.position.copy(position);
    const label = createText(name, 0.4, 0xffffff);
    label.position.z = TEXT_Z_OFFSET;
    box.add(label);
    scene.add(box);
    return box;
}

function createLabelledSphere(text, position, radius, color) {
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 32, 32),
        new THREE.MeshStandardMaterial({ color })
    );
    sphere.position.copy(position);
    const label = createText(text, 0.7, 0xffffff);
    label.position.z = radius + 0.01;
    sphere.add(label);
    scene.add(sphere);
    return sphere;
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2b49);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 70); 
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 10;
    controls.maxDistance = 200;
    controls.target.set(0, 0, 0);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(10, 15, 20);
    scene.add(directionalLight);
    
    const fontLoader = new FontLoader();
    fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/droid/droid_sans_regular.typeface.json', (loadedFont) => {
        font = loadedFont;
        createDiagram();
    });

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function createDiagram() {
    const organizationBox = new THREE.Mesh(
        RoundedBoxGeometry(100, 50, BOX_DEPTH*1.6, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
    );
    const organizationText = createText("AMBIENTE ESTERNO", 1.2, 0xffffff);
    organizationText.position.set(0, 22, 5.01);
    scene.add(organizationBox, organizationText);

    const businessModelHeight = 18;
    const businessModelBox = new THREE.Mesh(
        RoundedBoxGeometry(30, businessModelHeight, BOX_DEPTH*1.2, 0.5, 8, true),
        new THREE.MeshStandardMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
    );
    businessModelBox.position.set(1, 0, 0);
    const businessModelText = createText("MODELLO DI BUSINESS", 0.7, 0x000000);
    businessModelText.position.set(0, businessModelHeight / 2 - 1.5, TEXT_Z_OFFSET*1.1);
    businessModelBox.add(businessModelText);
    scene.add(businessModelBox);

    // **NUOVO**: Box SCOPO, MISSIONE E VISIONE
    const missionBoxHeight = businessModelHeight * 1.8;
    const missionBoxWidth = missionBoxHeight; // Quadrato
    const missionBoxDepth = BOX_DEPTH * 1.4; // Più profondo del business model, meno dell'ambiente esterno
    const missionBox = new THREE.Mesh(
        RoundedBoxGeometry(missionBoxWidth, missionBoxHeight, missionBoxDepth, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })
    );
    missionBox.position.set(0, 0, 0); // Leggermente più indietro del business model
    const missionText = createText("SCOPO, MISSIONE E VISIONE", 0.7, 0xffffff);
    missionText.position.set(0, missionBoxHeight / 2 - 1.5, missionBoxDepth / 2 + 0.1);
    missionBox.add(missionText);
    scene.add(missionBox);

    const inputSphereRadius = 3.0;
    const inputSpherePos = new THREE.Vector3(-15, 0, 0);
    const inputSphere = createLabelledSphere("INPUT", inputSpherePos, inputSphereRadius, 0x007bff);

    const attivitaSphereRadius = 3.0;
    const attivitaSpherePos = new THREE.Vector3(-1, 4, 0);
    const attivitaSphere = createLabelledSphere("ATTIVITÀ\nAZIENDALI", attivitaSpherePos, attivitaSphereRadius, 0x007bff, 0.5);

    const outputSphereRadius = 3.0;
    const outputSpherePos = new THREE.Vector3(-1, -4, 0);
    const outputSphere = createLabelledSphere("OUTPUT", outputSpherePos, outputSphereRadius, 0x007bff);
    
    const outcomeHeight = 4 * 3;
    const outcomeBox = new THREE.Mesh(
        RoundedBoxGeometry(6, outcomeHeight, BOX_DEPTH, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x28a745 })
    );
    outcomeBox.position.set(14, 0, 0);
    const outcomeText = createText("OUTCOME", 0.5, 0xffffff);
    outcomeText.position.z = TEXT_Z_OFFSET;
    outcomeBox.add(outcomeText);
    scene.add(outcomeBox);
	
// --- NUOVO ANELLO ---
    const ringRadius = 15; // Raggio dell'anello
    const tubeRadius = 0.5; // Spessore del "tubo" che forma l'anello
    const ringSegments = 64; // Segmenti per la geometria dell'anello

    const ringGeometry = new THREE.TorusGeometry(ringRadius, tubeRadius, 16, ringSegments);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x007bff, // Blu
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);

    // Posizione dell'anello: centrato tra input e outcome (sull'asse X) e verticalmente centrato
    // Input X: -12, Outcome X: 12. Centro X: (-12 + 12) / 2 = 0
    // Input Y: 0, Outcome Y: 0. Centro Y: 0
    ring.position.set(0, 0, 0); 
    
    // Orientamento verticale: ruota di 90 gradi sull'asse X (Math.PI / 2)
    ring.rotation.x = Math.PI ; 

    scene.add(ring);
    // --- FINE ANELLO ---	
	scene.add(createBox(-9.5,11.5,"RISCHI E\nOPPORTUNITÀ"));
	scene.add(createBox(9.5,11.5,"STRATEGIA E ALLOCAZIONE\nDELLE RISORSE"));
	scene.add(createBox(-9.5,-11.5,"PERFORMANCE"));
	scene.add(createBox(9.5,-11.5,"PROSPETTIVE"));


    const start_IA = new THREE.Vector3(inputSpherePos.x + inputSphereRadius, inputSpherePos.y, 0);
    const end_IA = new THREE.Vector3(attivitaSpherePos.x - attivitaSphereRadius, attivitaSpherePos.y, 0);
    createPipeArrow(start_IA, end_IA, 0x007bff, 0.5);

    const start_AO = new THREE.Vector3(attivitaSpherePos.x, attivitaSpherePos.y - attivitaSphereRadius, 0);
    const end_AO = new THREE.Vector3(outputSpherePos.x, outputSpherePos.y + outputSphereRadius, 0);
    createVolumetricArrow(new THREE.LineCurve3(start_AO, end_AO), 0x007bff);

    const outcomeLeftEdge = outcomeBox.position.x - 3;
    const start_Att_O = new THREE.Vector3(attivitaSpherePos.x + attivitaSphereRadius, attivitaSpherePos.y, 0);
    const end_Att_O = new THREE.Vector3(outcomeLeftEdge, attivitaSpherePos.y, 0);
    createVolumetricArrow(new THREE.LineCurve3(start_Att_O, end_Att_O), 0x28a745);
    const start_Out_O = new THREE.Vector3(outputSpherePos.x + outputSphereRadius, outputSpherePos.y, 0);
    const end_Out_O = new THREE.Vector3(outcomeLeftEdge, outputSpherePos.y, 0);
    createVolumetricArrow(new THREE.LineCurve3(start_Out_O, end_Out_O), 0x28a745);

    const capitalNames = ["FINANZIARIO", "PRODUTTIVO", "INTELLETTUALE", "UMANO", "SOCIALE E RELAZIONALE", "NATURALE"];
    capitalNames.forEach((name, i) => {
        const yPos = 12.5 - (i * 5);
        const boxPos = new THREE.Vector3(-40, yPos, 0);
        createCapitalBox(name, boxPos, 0x0056b3);
        let factor;
        if (i === 2 || i === 3) { factor = 0.25; } 
        else if (i === 1 || i === 4) { factor = 0.5; } 
        else { factor = 0.75; }
        const startPoint = boxPos.clone().setX(boxPos.x + 4);
        const endPoint = inputSphere.position.clone().setX(inputSphere.position.x - inputSphereRadius);
        createPipeArrow(startPoint, endPoint, 0x007bff, factor);
    });

    capitalNames.forEach((name, i) => {
        const yPos = 12.5 - (i * 5);
        const boxPos = new THREE.Vector3(40, yPos, 0);
        createCapitalBox(name, boxPos, 0x28a745);
        let factor;
        if (i === 0 || i === 5) { factor = 0.25; } 
        else if (i === 1 || i === 4) { factor = 0.5; } 
        else { factor = 0.75; }
        const startPoint = outcomeBox.position.clone().setX(outcomeBox.position.x + 3);
        const endPoint = boxPos.clone().setX(boxPos.x - 4);
        createPipeArrow(startPoint, endPoint, 0x28a745, factor);
    });

     // --- TUBO DI RITORNO SFUMATO (Stile idraulico) ---
    const feedbackPath = new THREE.CurvePath();
    const bendRadius = 2;
    const farRightX = 47; // Più a destra dei box verdi
    const farLeftX = -47; // Più a sinistra dei box azzurri
    const bottomY = -20; // Sotto l'ultimo capitale (stesso y della base dei box)

    // Segmenti del percorso
    const p_start = new THREE.Vector3(outcomeBox.position.x + 3, 0, 0); // Uscita da Outcome
    const p1 = new THREE.Vector3(farRightX - bendRadius, 0, 0); // Primo tratto orizzontale a destra
    const p2_control = new THREE.Vector3(farRightX, 0, 0); // Centro della prima curva (destra, verso il basso)
    const p2_end = new THREE.Vector3(farRightX, 0 - bendRadius, 0);

    const p3 = new THREE.Vector3(farRightX, bottomY + bendRadius, 0); // Primo tratto verticale a destra
    
    const p4_control = new THREE.Vector3(farRightX, bottomY, 0); // Centro della seconda curva (destra, verso sinistra)
    const p4_end = new THREE.Vector3(farRightX - bendRadius, bottomY, 0);

    const p5 = new THREE.Vector3(farLeftX + bendRadius, bottomY, 0); // Tratto orizzontale inferiore
    
    const p6_control = new THREE.Vector3(farLeftX, bottomY, 0); // Centro della terza curva (sinistra, verso l'alto)
    const p6_end = new THREE.Vector3(farLeftX, bottomY + bendRadius, 0);
    
    const p7 = new THREE.Vector3(farLeftX, 0 - bendRadius, 0); // Tratto verticale a sinistra (fino al centro verticale dei box azzurri)
    
    const p8_control = new THREE.Vector3(farLeftX, 0, 0); // Centro della quarta curva (sinistra, verso destra)
    const p8_end = new THREE.Vector3(farLeftX + bendRadius, 0, 0);
    
    const p_end = new THREE.Vector3(inputSphere.position.x - inputSphereRadius, 0, 0); // Ingresso in Input

    // Costruisco il percorso segmento per segmento con punti di controllo
    feedbackPath.add(new THREE.LineCurve3(p_start, p1));
    feedbackPath.add(new THREE.QuadraticBezierCurve3(p1, p2_control, p2_end)); // Curva verso il basso (destra)
    feedbackPath.add(new THREE.LineCurve3(p2_end, p3)); // Giù verso il fondo
    feedbackPath.add(new THREE.QuadraticBezierCurve3(p3, p4_control, p4_end)); // Curva a sinistra (fondo destra)
    feedbackPath.add(new THREE.LineCurve3(p4_end, p5)); // Tratto orizzontale inferiore
    feedbackPath.add(new THREE.QuadraticBezierCurve3(p5, p6_control, p6_end)); // Curva verso l'alto (fondo sinistra)
    feedbackPath.add(new THREE.LineCurve3(p6_end, p7)); // Su verso il centro dei box azzurri
    feedbackPath.add(new THREE.QuadraticBezierCurve3(p7, p8_control, p8_end)); // Curva a destra (sinistra)
    feedbackPath.add(new THREE.LineCurve3(p8_end, p_end)); // Dritto verso Input

    // **MODIFICA QUI**: Definisci solo due colori per una sfumatura chiara
    const feedbackColors = [
        new THREE.Color(0x28a745), // Verde (inizio)
        new THREE.Color(0x007bff)  // Blu (fine)
    ];
    createVolumetricArrow(feedbackPath, feedbackColors);

// **NUOVO CODICE PER LA FRECCIA SFUMATA IN BASSO**
    const bottomArrowWidth = 100;
    const bottomArrowHeight = 2;
    const bottomArrowDepth = 2;
    const bottomArrowRadius = 0.5;

    const arrowGeometry = RoundedBoxGeometry(bottomArrowWidth, bottomArrowHeight, bottomArrowDepth, bottomArrowRadius, 8, true);

    // Calcola le coordinate X minime e massime della geometria per la sfumatura
    arrowGeometry.computeBoundingBox();
    const minX = arrowGeometry.boundingBox.min.x;
    const maxX = arrowGeometry.boundingBox.max.x;
    const rangeX = maxX - minX;

    const colors = [];
    const colorStart = new THREE.Color(0x007bff); // Blu
    const colorEnd = new THREE.Color(0x28a745); // Verde

    // Itera sui vertici e assegna un colore interpolato
    const positionAttribute = arrowGeometry.getAttribute('position');
    for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const normalizedX = (x - minX) / rangeX; // Normalizza la posizione X tra 0 e 1
        const interpolatedColor = new THREE.Color().lerpColors(colorStart, colorEnd, normalizedX);
        colors.push(interpolatedColor.r, interpolatedColor.g, interpolatedColor.b);
    }
    arrowGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

    const arrowMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true, // Abilita l'uso dei colori dei vertici
        transparent: true,
        opacity: 1, // Imposta opacità desiderata per la freccia
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.set(0, -30, 0);
    scene.add(arrow);

    const bottomText = createText("CREAZIONE, PRESERVAZIONE O EROSIONE NEL TEMPO", 0.8, 0xffffff);
    bottomText.position.set(0, -30, 1);
    scene.add(bottomText);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
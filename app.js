import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let scene, camera, renderer, controls, raycaster, mouse;
let cubes = [];
let staticTubes = [];
let animatedFlows = [];
let selectedCube = null;
let selectedTube = null;
let savedCategories = {}; // Per memorizzare le categorie del file caricato

// Riferimenti agli elementi UI
const cubeConfigPanel = document.getElementById('cubeConfigPanel');
const cubeNameInput = document.getElementById('cubeName');
const cubeColorInput = document.getElementById('cubeColor');
const cubeSizeInput = document.getElementById('cubeSize');
const cubeOkButton = document.getElementById('cubeOkButton');
const tubeConfigPanel = document.getElementById('tubeConfigPanel');
const tubeLabelInput = document.getElementById('tubeLabel');
const tubeIntensityInput = document.getElementById('tubeIntensity');
const tubeStartSelect = document.getElementById('tubeStart');
const tubeEndSelect = document.getElementById('tubeEnd');
const tubeOkButton = document.getElementById('tubeOkButton');
const tubeInvertButton = document.getElementById('tubeInvertButton');
const saveButton = document.getElementById('saveButton');
const loadInput = document.getElementById('loadInput');

// Parametri per i cubi
const cubeSize = 2;
const borderRadius = 0.3;
const segments = 8;
const spacing = 8; // Spaziatura tra i cubi


// --- FUNZIONI DI SALVATAGGIO/CARICAMENTO ---

function clearScene() {
    // Rimuovi tutti gli oggetti dalla scena e svuota gli array
    cubes.forEach(cube => scene.remove(cube));
    staticTubes.forEach(tube => scene.remove(tube));
    animatedFlows.forEach(flow => flow.particles.forEach(p => scene.remove(p)));

    cubes = [];
    staticTubes = [];
    animatedFlows = [];
    hideAllPanels();
}

function salvaAmbiente() {
    const nodes = cubes.map(cube => ({
        name: cube.userData.name,
        position: {
            x: cube.position.x,
            y: cube.position.y,
            z: cube.position.z,
        },
        category: cube.userData.category || cube.userData.color 
    }));

    const connections = staticTubes.map(tube => ({
        from: tube.userData.cube1.userData.name,
        to: tube.userData.cube2.userData.name,
    }));

    const categoriesToSave = {};
    nodes.forEach(node => {
        if (!savedCategories[node.category]) {
            categoriesToSave[node.category] = node.category;
        }
    });

    const environmentData = {
        categories: Object.keys(savedCategories).length > 0 ? savedCategories : categoriesToSave,
        nodes: nodes,
        connections: connections,
    };

    const dataStr = JSON.stringify(environmentData, null, 4);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'environment-saved.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function caricaAmbiente(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            clearScene();
            creaEcosistemaDaDati(data);
        } catch (error) {
            alert('Errore: Il file selezionato non è un JSON valido.');
            console.error("Errore nel parsing del JSON:", error);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; 
}

// --------------------------------------------------

function creaEcosistemaDaDati(data) {
    const nodes = {};
    const { categories, nodes: nodeData, connections } = data;
    savedCategories = categories; 

    nodeData.forEach(nodeInfo => {
        const { name, position, category } = nodeInfo;
        const color = categories[category] || category || '#ffffff';
        const posVector = new THREE.Vector3(position.x, position.y, position.z);
        
        const cube = aggiungiCubo(posVector, name, color);
        cube.userData.category = category;
        nodes[name] = cube;
    });

    connections.forEach(({ from, to }) => {
        const cube1 = nodes[from];
        const cube2 = nodes[to];
        if (cube1 && cube2) {
            creaTuboStatico(cube1, cube2);
            creaTuboAnimato(cube1, cube2, `${from} to ${to}`, Math.random() * 40 + 10);
        } else {
            console.warn(`Connessione non creata: nodi mancanti (${from}, ${to})`);
        }
    });
}

async function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    camera.add(pointLight);
    scene.add(camera);

    try {
        const response = await fetch('Environment_Health.json');
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
        const environmentData = await response.json();
        creaEcosistemaDaDati(environmentData);
    } catch (error) {
        console.error("Impossibile caricare l'ambiente iniziale:", error);
        aggiungiCubo(new THREE.Vector3(0, 0, 0), "Fallback Cube", '#0077ff');
    }

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('click', onMouseClick, false);
    window.addEventListener('dblclick', onMouseDblClick, false);
    window.addEventListener('keydown', onKeyDown, false);

    cubeConfigPanel.addEventListener('click', event => event.stopPropagation());
    tubeConfigPanel.addEventListener('click', event => event.stopPropagation());
    
    cubeOkButton.addEventListener('click', onCubeOk);
    tubeOkButton.addEventListener('click', onTubeOk);
    tubeInvertButton.addEventListener('click', onTubeInvert);
    saveButton.addEventListener('click', salvaAmbiente);
    loadInput.addEventListener('change', caricaAmbiente);

    camera.position.z = 60;
}

function getContrastingTextColor(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return luminance > 128 ? '#404040' : '#D3D3D3';
}

function creaTextureTesto(text, backgroundColor) {
    const canvas = document.createElement('canvas');
    const canvasSize = 256;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext('2d');
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const textColor = getContrastingTextColor(backgroundColor);
    const words = text.split(' ');
    let fontSize = 48;
    context.font = `${fontSize}px Arial`;
    while (words.some(word => context.measureText(word).width > canvasSize - 20) && fontSize > 10) {
        fontSize -= 2;
        context.font = `${fontSize}px Arial`;
    }
    context.fillStyle = textColor;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (words.length > 1) {
        const lineHeight = fontSize * 1.2;
        const totalHeight = lineHeight * words.length;
        let startY = (canvasSize - totalHeight) / 2 + lineHeight / 2;
        words.forEach(word => {
            context.fillText(word, canvasSize / 2, startY);
            startY += lineHeight;
        });
    } else {
        context.fillText(text, canvasSize / 2, canvasSize / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function aggiungiCubo(position, name = "Nuovo Cubo", initialColor = '#0077ff') {
    const geometry = new RoundedBoxGeometry(cubeSize, cubeSize, cubeSize, segments, borderRadius);
    const textTexture = creaTextureTesto(name, initialColor);
    const materials = [];
    for (let i = 0; i < 6; i++) {
        materials.push(new THREE.MeshPhysicalMaterial({
            map: textTexture,
            color: new THREE.Color(initialColor),
            metalness: 0.1,
            roughness: 0.5,
            clearcoat: 1,
            clearcoatRoughness: 0.1
        }));
    }
    const newCube = new THREE.Mesh(geometry, materials);
    newCube.position.copy(position);
    newCube.userData = { name, color: initialColor, size: cubeSize };
    scene.add(newCube);
    cubes.push(newCube);
    return newCube;
}

function creaTuboStatico(cube1, cube2) {
    const dist = cube1.position.distanceTo(cube2.position);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.3 });
    const tubeGeometry = new THREE.CylinderGeometry(0.2, 0.2, dist, 8);
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.position.lerpVectors(cube1.position, cube2.position, 0.5);
    tube.lookAt(cube2.position);
    tube.rotateX(Math.PI / 2);
    tube.userData = { isTube: true, label: '', cube1, cube2 };
    staticTubes.push(tube);
    scene.add(tube);
    return tube;
}

function creaTuboAnimato(cube1, cube2, label, intensity) {
    const particleCount = 10;
    const particles = [];
    const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    for (let i = 0; i < particleCount; i++) {
        const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.userData.currentProgress = i * (1 / particleCount);
        particles.push(particle);
        scene.add(particle);
    }
    animatedFlows.push({ label, intensity, particles, cube1, cube2 });
}

function animaFlussi() {
    const startColor = new THREE.Color();
    const endColor = new THREE.Color();
    const currentColor = new THREE.Color();
    animatedFlows.forEach(flow => {
        startColor.set(flow.cube1.userData.color);
        endColor.set(flow.cube2.userData.color);
        const speed = flow.intensity / 10000;
        flow.particles.forEach(particle => {
            particle.userData.currentProgress += speed;
            if (particle.userData.currentProgress > 1) {
                particle.userData.currentProgress = 0;
            }
            particle.position.lerpVectors(flow.cube1.position, flow.cube2.position, particle.userData.currentProgress);
            currentColor.copy(startColor).lerp(endColor, particle.userData.currentProgress);
            particle.material.color.set(currentColor);
        });
    });
}

function eliminaCubo(cube) {
    const tubesToRemove = staticTubes.filter(t => t.userData.cube1 === cube || t.userData.cube2 === cube);
    tubesToRemove.forEach(tube => scene.remove(tube));
    staticTubes = staticTubes.filter(t => !tubesToRemove.includes(t));
    const flowsToRemove = animatedFlows.filter(f => f.cube1 === cube || f.cube2 === cube);
    flowsToRemove.forEach(flow => flow.particles.forEach(p => scene.remove(p)));
    animatedFlows = animatedFlows.filter(f => !flowsToRemove.includes(f));
    scene.remove(cube);
    cubes = cubes.filter(c => c !== cube);
    selectedCube = null;
    hideAllPanels();
}

function findCubeByLabel(label) {
    return cubes.find(c => c.userData.name === label);
}

function onMouseClick(event) {
    if (event.target.closest('.io-controls')) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersectsCubes = raycaster.intersectObjects(cubes);
    const intersectsTubes = raycaster.intersectObjects(staticTubes);
    if (intersectsCubes.length > 0) {
        hideAllPanels();
        selectedCube = intersectsCubes[0].object;
    } else if (intersectsTubes.length > 0) {
        hideAllPanels();
        selectedTube = intersectsTubes[0].object;
    } else {
        hideAllPanels();
        selectedCube = null;
        selectedTube = null;
    }
}

function onMouseDblClick(event) {
    if (event.target.closest('.io-controls')) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersectsCubes = raycaster.intersectObjects(cubes);
    const intersectsTubes = raycaster.intersectObjects(staticTubes);
    if (intersectsCubes.length > 0) {
        selectedCube = intersectsCubes[0].object;
        showCubePanel(selectedCube);
    } else if (intersectsTubes.length > 0) {
        selectedTube = intersectsTubes[0].object;
        const flow = animatedFlows.find(f => (f.cube1 === selectedTube.userData.cube1 && f.cube2 === selectedTube.userData.cube2) || (f.cube1 === selectedTube.userData.cube2 && f.cube2 === selectedTube.userData.cube1));
        showTubePanel(selectedTube.userData, flow);
    } else {
        hideAllPanels();
    }
}

function showCubePanel(cube) {
    cubeConfigPanel.style.display = 'block';
    cubeNameInput.value = cube.userData.name;
    cubeColorInput.value = cube.userData.color;
    cubeSizeInput.value = cube.userData.size;
}

function showTubePanel(tubeData, flowData) {
    tubeConfigPanel.style.display = 'block';
    const flowLabel = flowData ? flowData.label : `${tubeData.cube1.userData.name} to ${tubeData.cube2.userData.name}`;
    tubeLabelInput.value = flowLabel;
    tubeIntensityInput.value = flowData ? flowData.intensity : 0;
    tubeStartSelect.innerHTML = '';
    tubeEndSelect.innerHTML = '';
    cubes.forEach(cube => {
        const option1 = document.createElement('option');
        option1.value = option1.text = cube.userData.name;
        tubeStartSelect.add(option1);
        const option2 = document.createElement('option');
        option2.value = option2.text = cube.userData.name;
        tubeEndSelect.add(option2);
    });
    tubeStartSelect.value = tubeData.cube1.userData.name;
    tubeEndSelect.value = tubeData.cube2.userData.name;
}

function hideAllPanels() {
    cubeConfigPanel.style.display = 'none';
    tubeConfigPanel.style.display = 'none';
}

function onCubeOk() {
    if (selectedCube) {
        const oldName = selectedCube.userData.name;
        const newName = cubeNameInput.value;
        const newColor = cubeColorInput.value;
        const newSize = parseFloat(cubeSizeInput.value);
        selectedCube.userData = { ...selectedCube.userData, name: newName, color: newColor, size: newSize };
        const scale = newSize / cubeSize;
        selectedCube.scale.set(scale, scale, scale);
        const newTextTexture = creaTextureTesto(newName, newColor);
        selectedCube.material.forEach(material => {
            material.map.dispose();
            material.map = newTextTexture;
            material.color.set(newColor);
            material.needsUpdate = true;
        });
        if (tubeConfigPanel.style.display === 'block') {
            [tubeStartSelect, tubeEndSelect].forEach(select => {
                for (let option of select.options) {
                    if (option.value === oldName) {
                        option.value = option.text = newName;
                    }
                }
            });
        }
    }
    hideAllPanels();
}

function onTubeInvert() {
    if (!selectedTube) return;
    const startValue = tubeStartSelect.value;
    const endValue = tubeEndSelect.value;
    tubeStartSelect.value = endValue;
    tubeEndSelect.value = startValue;
}

function onTubeOk() {
    if (!selectedTube) return;
    const newTubeLabel = tubeLabelInput.value;
    const newTubeIntensity = parseFloat(tubeIntensityInput.value);
    const newStartCube = findCubeByLabel(tubeStartSelect.value);
    const newEndCube = findCubeByLabel(tubeEndSelect.value);
    let currentFlow = animatedFlows.find(f => (f.cube1 === selectedTube.userData.cube1 && f.cube2 === selectedTube.userData.cube2) || (f.cube1 === selectedTube.userData.cube2 && f.cube2 === selectedTube.userData.cube1));
    if (newStartCube === selectedTube.userData.cube1 && newEndCube === selectedTube.userData.cube2) {
        if (currentFlow) {
            currentFlow.intensity = newTubeIntensity;
            currentFlow.label = newTubeLabel;
        }
    } else {
        scene.remove(selectedTube);
        staticTubes = staticTubes.filter(t => t !== selectedTube);
        if (currentFlow) {
            currentFlow.particles.forEach(p => scene.remove(p));
            animatedFlows = animatedFlows.filter(f => f !== currentFlow);
        }
        const newTube = creaTuboStatico(newStartCube, newEndCube);
        if (newTubeIntensity > 0) {
            creaTuboAnimato(newStartCube, newEndCube, newTubeLabel, newTubeIntensity);
        }
        selectedTube = newTube;
    }
    hideAllPanels();
}

// === MODIFICA QUI ===
// Riattivata la funzionalità di aggiunta con logica migliorata
function onKeyDown(event) {
    // Non eseguire comandi se si sta scrivendo in un input
    if (event.target.tagName.toLowerCase() === 'input' || event.target.tagName.toLowerCase() === 'select') return;

    switch (event.key) {
        case 'a':
        case 'A':
            if (selectedCube) {
                // Definisce le direzioni in cui cercare spazio libero
                const offsets = [
                    new THREE.Vector3(spacing, 0, 0),   // Destra
                    new THREE.Vector3(-spacing, 0, 0),  // Sinistra
                    new THREE.Vector3(0, spacing, 0),   // Sopra
                    new THREE.Vector3(0, -spacing, 0),  // Sotto
                    new THREE.Vector3(0, 0, spacing),   // Dietro
                    new THREE.Vector3(0, 0, -spacing)   // Davanti
                ];

                let positionFound = false;
                for (const offset of offsets) {
                    const newPos = selectedCube.position.clone().add(offset);
                    
                    // Controlla se la posizione è già occupata
                    const isOccupied = cubes.some(c => c.position.distanceTo(newPos) < 0.1);

                    if (!isOccupied) {
                        const name = `Nuovo Cubo ${cubes.length}`;
                        const color = '#808080'; // Grigio di default
                        const newCube = aggiungiCubo(newPos, name, color);
                        
                        creaTuboStatico(selectedCube, newCube);
                        creaTuboAnimato(selectedCube, newCube, `Flow to ${name}`, 50);
                        
                        positionFound = true;
                        break; // Esce dal ciclo una volta trovato uno spazio
                    }
                }

                if (!positionFound) {
                    console.log("Nessuno spazio libero trovato vicino al cubo selezionato.");
                }

            } else {
                console.log("Seleziona un cubo per poterne aggiungere uno nuovo vicino.");
            }
            break;

        case 'd':
        case 'D':
            if (selectedCube) {
                eliminaCubo(selectedCube);
            }
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    animaFlussi();
    renderer.render(scene, camera);
}

init();
animate();
// --- CraftSprint.IO — Fixed Game JS ---
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.98, 1);

    // --- Lights ---
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.8;
    const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(0, -1, 1), scene);
    dir.intensity = 0.5;

    // --- Game vars ---
    let player = null;
    let camera = null;
    const lanePositions = [-3, 0, 3];
    let currentLane = 1;
    let targetX = 0;

    let score = 0;
    let distance = 0;
    let speed = 0.2; // base speed

    let emeraldCount = parseInt(localStorage.getItem('emeralds')) || 0;

    let groundTiles = [];
    let tnts = [];
    let emeralds = [];

    let isJumping = false;
    const JUMP_HEIGHT = 4;
    const JUMP_DURATION = 50;
    let jumpFrameCount = 0;

    let gameActive = false;

    // --- UI ---
    const scoreEl = document.getElementById('score');
    const distanceEl = document.getElementById('distance');
    const emeraldCountEl = document.getElementById('emeraldCount');
    const loadingEl = document.getElementById('loading');
    const deathScreen = document.getElementById('deathScreen');
    const deathMessage = document.getElementById('deathMessage');
    const deathScore = document.getElementById('deathScore');
    const respawnBtn = document.getElementById('respawnBtn');
    const titleBtn = document.getElementById('titleBtn');
    const offlineStatusEl = document.getElementById('offlineStatus');

    emeraldCountEl.textContent = emeraldCount;

    // --- Connectivity ---
    let isOnline = navigator.onLine;

    function updateOnlineStatus() {
        isOnline = navigator.onLine;
        offlineStatusEl.style.display = isOnline ? 'none' : 'block';
    }
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // --- Firebase ---
    let auth, db, functions;
    let playerName = 'Steve';

    const firebaseConfig = {
        apiKey: "AIzaSyBoe0WmbD5_PBCtLAOTqPg_3BYcMevXU-o",
        authDomain: "craftsprintio.firebaseapp.com",
        projectId: "craftsprintio",
        storageBucket: "craftsprintio.appspot.com",
        messagingSenderId: "51453864626",
        appId: "1:51453864626:web:64fd0a3423e608df7877ab",
        measurementId: "G-MFH20CF27R"
    };

    // Local dirty counter for unsynced emeralds
    let localUnsyncedEmeralds = parseInt(localStorage.getItem('emeralds_unsynced') || '0', 10);

    function markEmeraldDirty(delta = 1) {
        localUnsyncedEmeralds += delta;
        localStorage.setItem('emeralds_unsynced', String(localUnsyncedEmeralds));
    }

    async function trySyncEmeralds() {
        if (!isOnline || !auth || !auth.currentUser || localUnsyncedEmeralds === 0) return;
        const uid = auth.currentUser.uid;
        const userRef = db.collection('users').doc(uid);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(userRef);
                if (!snap.exists) {
                    tx.set(userRef, {
                        emeralds: localUnsyncedEmeralds,
                        username: playerName
                    });
                } else {
                    const cur = snap.data().emeralds || 0;
                    tx.update(userRef, {
                        emeralds: cur + localUnsyncedEmeralds
                    });
                }
            });
            localUnsyncedEmeralds = 0;
            localStorage.setItem('emeralds_unsynced', '0');
        } catch (e) {
            console.warn('Sync failed, will retry later:', e);
        }
    }

    if (isOnline) {
        try {
            firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
            functions = firebase.functions();

            auth.onAuthStateChanged(async user => {
                if (user) {
                    const uid = user.uid;
                    const userRef = db.collection('users').doc(uid);

                    userRef.onSnapshot(doc => {
                        if (doc.exists) {
                            const data = doc.data();
                            emeraldCount = data.emeralds ?? emeraldCount;
                            emeraldCountEl.textContent = emeraldCount;
                            localStorage.setItem('emeralds', emeraldCount);
                            playerName = data.username || 'Steve';
                        }
                    }, err => {
                        console.error("User listener error:", err);
                        playerName = 'Steve';
                        emeraldCount = parseInt(localStorage.getItem('emeralds')) || 0;
                        emeraldCountEl.textContent = emeraldCount;
                    });

                    trySyncEmeralds();
                } else {
                    playerName = 'Steve';
                    emeraldCount = parseInt(localStorage.getItem('emeralds')) || 0;
                    emeraldCountEl.textContent = emeraldCount;
                    firebase.auth().signInAnonymously().catch(e => console.error("Anon sign-in error:", e));
                }
            });
        } catch (e) {
            console.error("Firebase init failed:", e);
            isOnline = false;
            updateOnlineStatus();
        }
    }

    // --- Camera ---
    function createCamera() {
        camera = new BABYLON.FollowCamera("followCam", new BABYLON.Vector3(0, 8, -25), scene);
        camera.lockedTarget = player;
        camera.radius = 15;
        camera.heightOffset = 8;
        camera.rotationOffset = 0;
        camera.cameraAcceleration = 0.15;
        camera.maxCameraSpeed = 50;
        camera.inputs.clear();
        scene.activeCamera = camera;
    }

    // --- Assets ---
    const ASSETS = {
        player: "models/steve.glb",
        ground: "models/grass.glb",
        obstacle: "models/tnt.glb"
    };

    let groundTemplate = null;
    let tntTemplate = null;
    let emeraldMaterial = null;

    let assetsLoaded = 0;
    const totalAssetsToLoad = 3;

    function onAssetLoaded() {
        assetsLoaded++;
        if (assetsLoaded === totalAssetsToLoad) {
            loadingEl.style.display = 'none';
            initGame();
            gameActive = true;
        }
    }

    function loadAssets() {
        // Player
        BABYLON.SceneLoader.ImportMesh("", "", ASSETS.player, scene, meshes => {
            player = meshes[0];
            player.scaling = new BABYLON.Vector3(1.5, 1.5, 1.5);
            player.position = new BABYLON.Vector3(0, 1.7, 0);
            targetX = player.position.x;
            createCamera();
            onAssetLoaded();
        }, null, (_s, msg, ex) => {
            console.error("Player load error:", msg, ex);
            failLoad();
        });

        // Ground
        BABYLON.SceneLoader.ImportMesh("", "", ASSETS.ground, scene, meshes => {
            groundTemplate = meshes[0];
            groundTemplate.isVisible = false;
            onAssetLoaded();
        }, null, (_s, msg, ex) => {
            console.error("Ground load error:", msg, ex);
            failLoad();
        });

        // TNT
        BABYLON.SceneLoader.ImportMesh("", "", ASSETS.obstacle, scene, meshes => {
            tntTemplate = meshes[0];
            tntTemplate.isVisible = false;
            onAssetLoaded();
        }, null, (_s, msg, ex) => {
            console.error("Obstacle load error:", msg, ex);
            failLoad();
        });

        // Emerald material
        emeraldMaterial = new BABYLON.StandardMaterial("emeraldMat", scene);
        emeraldMaterial.diffuseTexture = new BABYLON.Texture("images/emerald.png", scene);
        emeraldMaterial.diffuseTexture.hasAlpha = true;
        emeraldMaterial.backFaceCulling = false;
        emeraldMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        emeraldMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
    }

    function failLoad() {
        gameActive = false;
        loadingEl.textContent = "Error loading game assets. Please refresh.";
        loadingEl.style.color = 'red';
    }

    // --- World ---
    const SPAWN_INTERVAL = 40;
    let nextSpawnZ = 60;

    function createGroundTiles(initialCount) {
        let z = 0;
        for (let i = 0; i < initialCount; i++, z += 10) createGroundTile(z);
    }

    function createGroundTile(z) {
        if (!groundTemplate) return;
        const tile = groundTemplate.clone("groundClone");
        tile.isVisible = true;
        tile.scaling = new BABYLON.Vector3(5, 1, 5);
        tile.position = new BABYLON.Vector3(0, -0.5, z);
        groundTiles.push(tile);
    }

    function updateGroundTiles() {
        const behind = player.position.z - 20;
        groundTiles = groundTiles.filter(t => {
            if (t.position.z < behind) {
                t.dispose();
                return false;
            }
            return true;
        });

        const last = groundTiles[groundTiles.length - 1];
        if (last && last.position.z < player.position.z + 100) {
            createGroundTile(last.position.z + 10);
        }
    }

    function spawnLaneObjects(spawnZ) {
        lanePositions.forEach(lane => {
            const r = Math.random();
            if (r < 0.6) createObstacle(lane, spawnZ);
            else if (r < 0.8) createEmerald(lane, spawnZ);
        });
        nextSpawnZ += SPAWN_INTERVAL;
    }

    function createObstacle(x, z) {
        if (!tntTemplate) return;
        const obs = tntTemplate.clone("tntClone");
        obs.isVisible = true;
        obs.scaling = new BABYLON.Vector3(2.5, 2.5, 2.5);
        obs.position = new BABYLON.Vector3(x, 1.25, z);
        tnts.push(obs);
    }

    function updateObstacles() {
        const behind = player.position.z - 10;
        for (let i = tnts.length - 1; i >= 0; i--) {
            const o = tnts[i];

            if (o.position.z < behind) {
                o.dispose();
                tnts.splice(i, 1);
                continue;
            }

            if (!isJumping &&
                Math.abs(o.position.x - player.position.x) < 1.5 &&
                Math.abs(o.position.z - player.position.z) < 1.5) {

                gameActive = false;
                deathMessage.textContent = `${playerName} was blown up by Block of TNT`;
                deathScore.textContent = `Score: ${Math.floor(score)}`;
                deathScreen.style.display = 'flex';

                respawnBtn.onclick = () => {
                    deathScreen.style.display = 'none';
                    softReset();
                };
                titleBtn.onclick = () => window.location.href = 'home.html';
                return;
            }
        }
    }

    // --- Emeralds ---
    function createEmerald(x, z) {
        const emerald = BABYLON.MeshBuilder.CreatePlane("emerald", {
            width: 1,
            height: 1
        }, scene);
        emerald.position.set(x, 2, z);
        emerald.material = emeraldMaterial;
        emerald.rotation.y = Math.random() * Math.PI * 2;
        emeralds.push(emerald);
    }

    function isColliding(player, emerald) {
        const px = player.position.x;
        const py = player.position.y;
        const pz = player.position.z;

        const ex = emerald.position.x;
        const ey = emerald.position.y;
        const ez = emerald.position.z;

        const playerSize = {
            x: 1.5,
            y: 3,
            z: 1.5
        };
        const emeraldSize = {
            x: 0.5,
            y: 0.5,
            z: 0.5
        };

        return (
            Math.abs(px - ex) < (playerSize.x / 2 + emeraldSize.x / 2) &&
            Math.abs(py - ey) < (playerSize.y / 2 + emeraldSize.y / 2) &&
            Math.abs(pz - ez) < (playerSize.z / 2 + emeraldSize.z / 2)
        );
    }

    async function collectEmerald(e) {
        emeraldCount++;
        emeraldCountEl.textContent = emeraldCount;
        localStorage.setItem('emeralds', emeraldCount);

        if (auth && auth.currentUser && isOnline) {
            const uid = auth.currentUser.uid;
            const userRef = db.collection('users').doc(uid);

            try {
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(userRef);
                    if (!snap.exists) {
                        tx.set(userRef, {
                            emeralds: 1,
                            username: playerName
                        });
                    } else {
                        const current = snap.data().emeralds || 0;
                        tx.update(userRef, {
                            emeralds: current + 1
                        });
                    }
                });
            } catch (err) {
                console.warn('Failed to update emeralds on Firestore, marking dirty.', err);
                markEmeraldDirty(1);
            }
        } else {
            markEmeraldDirty(1);
        }

        e.dispose();
    }

    function updateEmeralds() {
        const behind = player.position.z - 10; // slightly behind

        for (let i = emeralds.length - 1; i >= 0; i--) {
            const e = emeralds[i];

            if (e.position.z < behind) {
                e.dispose();
                emeralds.splice(i, 1);
                continue;
            }

            e.rotation.y += 0.2;

            if (isColliding(player, e)) {
                collectEmerald(e);
                emeralds.splice(i, 1);
            }
        }
    }

    // --- Player actions ---
    function jump() {
        if (!isJumping && gameActive) {
            isJumping = true;
            jumpFrameCount = 0;
        }
    }

    function movePlayer(dir) {
        if (!gameActive) return;
        if (dir === 'left' && currentLane > 0) currentLane--;
        if (dir === 'right' && currentLane < 2) currentLane++;
        targetX = lanePositions[currentLane];
    }

    // --- Input ---
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') movePlayer('left');
        if (e.key === 'ArrowRight') movePlayer('right');
        if (e.key === 'ArrowUp' || e.key === ' ') jump();
    });

    let touchStartX = 0,
        touchStartY = 0;
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length > 0) {
            const t = e.touches[0];
            touchStartX = t.clientX;
            touchStartY = t.clientY;
        }
    }, {
        passive: true
    });

    canvas.addEventListener('touchend', e => {
        if (e.changedTouches.length > 0) {
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 30) movePlayer('right');
                else if (dx < -30) movePlayer('left');
            } else if (dy < -30) jump();
        }
    }, {
        passive: true
    });

    // --- Game loop ---
    function initGame() {
        createGroundTiles(20);
        engine.runRenderLoop(() => scene.render());

        scene.registerBeforeRender(() => {
            if (!gameActive || !player) return;

            score += 0.01;
            scoreEl.textContent = 'Score: ' + Math.floor(score);

            speed = 0.22 + (score / 1000) * 0.02;

            distance += speed * 0.5;
            distanceEl.textContent = 'Distance: ' + Math.floor(distance) + ' m';

            player.position.z += speed;

            player.position.x += (targetX - player.position.x) * 0.2;

            if (isJumping) {
                jumpFrameCount++;
                const pct = jumpFrameCount / JUMP_DURATION;
                const h = Math.sin(pct * Math.PI) * JUMP_HEIGHT;
                player.position.y = 1.7 + h;
                if (jumpFrameCount >= JUMP_DURATION) {
                    isJumping = false;
                    player.position.y = 1.7;
                }
            }

            updateGroundTiles();
            updateObstacles();
            updateEmeralds();

            if (player.position.z + 60 > nextSpawnZ) spawnLaneObjects(nextSpawnZ);
        });

        window.addEventListener('resize', () => engine.resize());
    }

    // --- Soft reset ---
    function softReset() {
        groundTiles.forEach(m => m.dispose());
        tnts.forEach(m => m.dispose());
        emeralds.forEach(m => m.dispose());
        groundTiles = [];
        tnts = [];
        emeralds = [];

        score = 0;
        distance = 0;
        speed = 0.2;
        currentLane = 1;
        targetX = lanePositions[currentLane];
        isJumping = false;
        jumpFrameCount = 0;
        nextSpawnZ = 60;

        if (player) player.position.set(0, 1.7, 0);

        deathScreen.style.display = 'none';
        scoreEl.textContent = 'Score: 0';
        distanceEl.textContent = 'Distance: 0 m';
        createGroundTiles(20);
        gameActive = true;
    }

    // --- Start ---
    loadAssets();
});
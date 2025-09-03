// 1️⃣ Populate static UI
const cfg = window.homeConfig;
const panoramaEl = document.getElementById("panorama");
const splashEl = document.getElementById("splashText");
const versionEl = document.getElementById("versionText");
const creditEl = document.getElementById("creditText");

panoramaEl.style.backgroundImage = `url('${cfg.panoramas[Math.floor(Math.random() * cfg.panoramas.length)]}')`;
splashEl.innerText = cfg.splashTexts[Math.floor(Math.random() * cfg.splashTexts.length)];
versionEl.innerText = cfg.version;
creditEl.innerText = cfg.creator;

// 2️⃣ Check online status
const offlineMode = !navigator.onLine;
let currentUid = offlineMode ? "offlineUser" : null;

// 3️⃣ LocalStorage fallback
if (offlineMode) {
    localStorage.setItem("username", localStorage.getItem("username") || "Steve");
    localStorage.setItem("emeralds", localStorage.getItem("emeralds") || 0);
    localStorage.setItem("equippedSkin", localStorage.getItem("equippedSkin") || "steve");

    document.getElementById("vipWelcomeReward").style.display = "none";
    const vipBtn = document.getElementById("vipBuyBtn");
    vipBtn.style.display = "block";
    vipBtn.style.opacity = 0;
    vipBtn.style.pointerEvents = "none";
} else {
    // 4️⃣ Firebase init (only if online)
    const firebaseConfig = {
        apiKey: "AIzaSyBoe0WmbD5_PBCtLAOTqPg_3BYcMevXU-o",
        authDomain: "craftsprintio.firebaseapp.com",
        projectId: "craftsprintio",
        storageBucket: "craftsprintio.appspot.com",
        messagingSenderId: "51453864626",
        appId: "1:51453864626:web:64fd0a3423e608df7877ab",
        measurementId: "G-MFH20CF27R"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    async function checkVipWelcomeReward() {
        if (!currentUid) return;
        const doc = await db.collection("users").doc(currentUid).get();
        if (doc.exists && doc.data().rank === "VIP" && !doc.data().vipWelcomeClaimed) {
            document.getElementById("vipWelcomeReward").style.display = "block";
        }
    }

    async function claimVipWelcomeReward() {
        if (!currentUid) return;
        const ref = db.collection("users").doc(currentUid);
        const snap = await ref.get();
        if (snap.exists && snap.data().rank === "VIP" && !snap.data().vipWelcomeClaimed) {
            const newE = (snap.data().emeralds || 0) + 100;
            await ref.update({
                emeralds: newE,
                vipWelcomeClaimed: true
            });
            localStorage.setItem("emeralds", newE);
            alert("🎉 Welcome VIP! 100 emeralds added.");
            document.getElementById("vipWelcomeReward").style.display = "none";
            showEmeraldRain();
        }
    }

    async function checkVipStatus() {
        if (!currentUid) return;
        const doc = await db.collection("users").doc(currentUid).get();
        if (doc.exists && doc.data().rank !== "VIP" && doc.data().rank !== "Owner") {
            document.getElementById("vipBuyBtn").style.display = "block";
        }
    }

    window.onload = function() {
        auth.onAuthStateChanged(user => {
            if (!user) return location.href = "login.html";
            currentUid = user.uid;
            checkVipWelcomeReward();
            checkVipStatus();
        });
    };
}

// 5️⃣ Emerald rain (works offline)
function showEmeraldRain(count = 50) {
    let dropped = 0;
    const interval = setInterval(() => {
        const emerald = document.createElement("img");
        emerald.src = "images/emerald.png";
        emerald.className = "emerald-rain";
        emerald.style.left = Math.random() * 100 + "vw";
        emerald.style.top = "-50px";
        emerald.style.position = "fixed";
        emerald.style.width = "32px";
        emerald.style.height = "32px";
        emerald.style.zIndex = 9999;
        document.body.appendChild(emerald);
        emerald.animate([{
            transform: "translateY(0px)"
        }, {
            transform: "translateY(100vh)"
        }], {
            duration: 2000 + Math.random() * 1500,
            easing: "ease-in"
        });
        setTimeout(() => emerald.remove(), 4000);
        dropped++;
        if (dropped >= count) clearInterval(interval);
    }, 50);
}

// 6️⃣ Auto-scale splash & name
function autoScaleSplash(el, maxF = window.innerWidth >= 768 ? 16 : 10, minF = 6) {
    let f = maxF;
    el.style.fontSize = f + "px";
    el.style.whiteSpace = "normal";
    setTimeout(() => {
        const mh = f * 3.2;
        while ((el.scrollWidth > el.clientWidth || el.scrollHeight > mh) && f > minF) {
            f--;
            el.style.fontSize = f + "px";
        }
    }, 0);
}

function autoScaleName(el, maxF = 12, minF = 10) {
    let f = maxF;
    el.style.fontSize = f + "px";
    while (el.scrollWidth > el.clientWidth && f > minF) {
        f--;
        el.style.fontSize = f + "px";
    }
}

function scaleSplashAndName() {
    autoScaleSplash(document.getElementById("splashText"));
    autoScaleName(document.getElementById("playerName"));
}
window.addEventListener("resize", scaleSplashAndName);

// 7️⃣ Babylon.js player preview (works offline)
window.addEventListener("load", () => {
    const name = localStorage.getItem("username") || "Steve";
    document.getElementById("playerName").innerText = name;

    const skin = localStorage.getItem("equippedSkin") || "steve";
    const canvas = document.getElementById("playerCanvas");
    canvas.setAttribute("tabindex", "-1");

    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2.2, 2.5, new BABYLON.Vector3(0, 1.1, 0), scene);
    camera.attachControl(canvas, true);
    camera.panningSensibility = 0;
    camera.inputs.clear();
    camera.lowerRadiusLimit = camera.upperRadiusLimit = 2.9;
    camera.lowerBetaLimit = camera.upperBetaLimit = Math.PI / 2.2;
    camera.wheelPrecision = 0;
    camera.inputs.remove(camera.inputs.attached.mousewheel);

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.9;

    let modelRoot = null,
        lastX = 0,
        dragging = false,
        targetRot = 0;

    canvas.addEventListener("pointerdown", e => {
        dragging = true;
        lastX = e.clientX;
    });
    canvas.addEventListener("pointerup", () => dragging = false);
    canvas.addEventListener("pointermove", e => {
        if (!dragging || !modelRoot) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        targetRot -= dx * 0.1;
    });

    BABYLON.SceneLoader.Append("models/", skin + ".glb", scene, () => {
        modelRoot = scene.meshes[0];
        if (modelRoot) modelRoot.rotation = new BABYLON.Vector3(0, 0, 0), modelRoot.scaling = new BABYLON.Vector3(2, 1, 1.5);

        scene.meshes.forEach(m => {
            if (m.material && m.material instanceof BABYLON.PBRMaterial) {
                m.material.environmentTexture = null;
                m.material.metallic = 0;
                m.material.roughness = 0.9;
                m.material.backFaceCulling = false;
            }
        });

        const idle = scene.getAnimationGroupByName("animation.player.idle");
        if (idle) idle.start(true);

        document.getElementById("loadingScreen").style.display = "none";
        document.getElementById("mainMenu").style.display = "flex";
    });

    engine.runRenderLoop(() => {
        scene.render();
        if (modelRoot) modelRoot.rotation.y = BABYLON.Scalar.Lerp(modelRoot.rotation.y, targetRot, 0.1);
    });

    window.addEventListener("resize", () => engine.resize());
    scaleSplashAndName();
});
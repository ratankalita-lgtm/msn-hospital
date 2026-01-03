
// --- GLOBAL VARIABLES ---
let db_patients = []; 
let db_visits = [];
let loadedPID = null; 

// --- DOCTOR LIST ---
const hospitalDoctors = [
    { name: "Dr. Jayanta Boroowa",       specialty: "Medical Director" },
    { name: "Dr. Pratibha Chauhan Paul", specialty: "Oculoplasty & PHACO" },
    { name: "Dr. Nilutpal Borah",        specialty: "Retina & Diabetic Eye" },
    { name: "Dr. Nilakshi Baruah",       specialty: "Cornea & Refractive" },
    { name: "Dr. Sanjay Kr Buragohain",  specialty: "Neuro-Ophth & Glaucoma" }
];

const nagaonPlaces = ["Nagaon Town", "Haibargaon", "Raha", "Kampur", "Dhing", "Rupahi", "Samaguri", "Kaliabor", "Jakhalabandha", "Hojai", "Lanka", "Doboka", "Lumding", "Batadrava", "Juria", "Kathiatoli", "Puranigudam", "Uriumgaon", "Nonoi", "Barhampur", "Chapanala"];

// --- INITIALIZATION ---
window.onload = function() {
    // Check if Firebase loaded
    if(window.db && window.onSnapshot && window.collection) {
        startRealTimeSync();
        console.log("Connected to Cloud Database");
    } else {
        setTimeout(() => {
            if(window.db) {
                startRealTimeSync();
            } else {
                alert("Error: Database connection failed. Check Internet.");
            }
        }, 1000);
    }

    setupUI();
    loadDoctorsList();
};

function setupUI() {
    const dl = document.getElementById('local-places');
    if(dl) {
        dl.innerHTML = '';
        nagaonPlaces.forEach(p => { const o = document.createElement('option'); o.value = p; dl.appendChild(o); });
    }

    document.getElementById('registrationForm').addEventListener('submit', (e) => { e.preventDefault(); createOPDVisit(); });
    document.getElementById('searchBtn').addEventListener('click', searchDatabase);
    document.getElementById('clearBtn').addEventListener('click', resetForm);
    document.getElementById('dob').addEventListener('change', calculateAge);
    
    document.getElementById('pincode').addEventListener('input', (e) => { 
        if(e.target.value.startsWith("782")) document.getElementById('district').value = "Nagaon"; 
    });
}

function loadDoctorsList() {
    const doctorSelect = document.getElementById('assigned_doctor');
    doctorSelect.innerHTML = '<option value="">-- Select Doctor --</option>';
    hospitalDoctors.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.name;
        option.textContent = `${doc.name} (${doc.specialty})`;
        doctorSelect.appendChild(option);
    });
}

// --- 1. CLOUD SYNC ---
function startRealTimeSync() {
    window.onSnapshot(window.collection(window.db, "patients"), (snapshot) => {
        db_patients = snapshot.docs.map(doc => ({ ...doc.data(), firebaseId: doc.id }));
        const statTotal = document.getElementById('stat-total');
        if(statTotal) statTotal.innerText = db_patients.length;
    }, (error) => {
        console.error("Patient sync error:", error);
    });

    window.onSnapshot(window.collection(window.db, "visits"), (snapshot) => {
        db_visits = snapshot.docs.map(doc => ({ ...doc.data(), firebaseId: doc.id }));
        renderTable(); 
    }, (error) => {
        console.error("Visit sync error:", error);
    });
}

// --- 2. CORE: REGISTRATION ---
async function createOPDVisit() {
    const btn = document.querySelector('#saveBtn');
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const name = document.getElementById('name').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const docName = document.getElementById('assigned_doctor').value;
        
        // IMPROVED VALIDATION
        if(!name || !phone || !docName) throw new Error("Please fill Name, Phone and Doctor.");
        
        // Regex to ensure exactly 10 digits (No letters allowed)
        if (!/^\d{10}$/.test(phone)) {
            throw new Error("Phone number must be exactly 10 digits (Numbers only).");
        }

        // IMPROVED ID GENERATION (Timestamp + Random digit to prevent collision)
        let pid = loadedPID; 
        if (!pid) {
            pid = 'P' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10);
        }

        const todayStr = new Date().toLocaleDateString('en-CA'); 

        const patientRecord = {
            id: pid,
            name: name,
            guardian: document.getElementById('guardian').value,
            dob: document.getElementById('dob').value,
            age: document.getElementById('age').value,
            gender: document.getElementById('gender').value,
            phone: phone,
            district: document.getElementById('district').value,
            address: document.getElementById('address').value,
            lastVisit: todayStr
        };

        const existingP = db_patients.find(p => p.id === pid);
        
        if(existingP) {
            await window.updateDoc(window.doc(window.db, "patients", existingP.firebaseId), patientRecord);
        } else {
            await window.addDoc(window.collection(window.db, "patients"), patientRecord);
        }

        // IMPROVED OPD ID GENERATION
        const opdID = 'OPD-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10);
        
        const visitRecord = {
            opdId: opdID,
            pid: pid,
            patientName: name,
            age: patientRecord.age,
            gender: patientRecord.gender,
            doctor: docName,
            type: document.getElementById('visit_type').value,
            date: new Date().toLocaleDateString(), 
            isoDate: todayStr,
            timestamp: Date.now(),
            status: "Waiting"
        };

        await window.addDoc(window.collection(window.db, "visits"), visitRecord);
        
        showToast(`Success! OPD: ${opdID}`);
        resetForm();

    } catch (e) {
        alert(e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- 3. SEARCH ---
function searchDatabase() {
    const qID = document.getElementById('search_pid').value.trim().toUpperCase();
    const qPhone = document.getElementById('search_phone').value.trim();
    const resultDiv = document.getElementById('search-result');
    resultDiv.innerHTML = '';

    if(!qID && !qPhone) { resultDiv.innerHTML = '<p style="padding:10px; color:#666;">Enter ID or Phone.</p>'; return; }
    
    // Unique filter to avoid duplicates in search view
    const found = db_patients.filter(p => 
        (qID && p.id.toUpperCase().includes(qID)) || 
        (qPhone && p.phone.includes(qPhone))
    );

    if(found.length === 0) { resultDiv.innerHTML = '<p style="color:red; padding:10px;">No record found.</p>'; return; }

    let html = '<ul style="list-style:none; padding:0;">';
    found.forEach(p => {
        html += `
        <li onclick="loadPatient('${p.id}')">
            <strong>${p.name}</strong> <small>(${p.id})</small><br>
            <span style="color:#555; font-size:0.8em;">${p.phone}</span>
        </li>`;
    });
    html += '</ul>';
    resultDiv.innerHTML = html;
}

window.loadPatient = function(id) {
    const p = db_patients.find(x => x.id === id);
    if(!p) return;
    
    loadedPID = p.id; 
    
    document.getElementById('patient_id').value = p.id;
    document.getElementById('name').value = p.name;
    document.getElementById('guardian').value = p.guardian;
    document.getElementById('dob').value = p.dob;
    document.getElementById('age').value = p.age;
    document.getElementById('gender').value = p.gender;
    document.getElementById('phone').value = p.phone;
    document.getElementById('district').value = p.district;
    document.getElementById('address').value = p.address;
    
    document.getElementById('search-result').innerHTML = '<div style="background:#d4edda; color:#155724; padding:5px;">Patient Loaded.</div>';
    document.getElementById('visit_type').value = "Review / Follow-up";
}

// --- 4. RENDER TABLE ---
function renderTable() {
    const tbody = document.querySelector('#patients-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const todayIso = new Date().toLocaleDateString('en-CA'); 

    const displayData = db_visits.filter(v => {
        if (v.isoDate && v.isoDate === todayIso) return true;
        const localToday = new Date().toLocaleDateString();
        return v.date === localToday;
    });
    
    displayData.sort((a, b) => b.timestamp - a.timestamp);

    const statToday = document.getElementById('stat-today');
    if (statToday) statToday.innerText = displayData.length;

    if (displayData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#777;">No OPD Registrations Today</td></tr>';
        return;
    }

    displayData.forEach(v => {
        let badgeClass = 'waiting'; 
        if (v.status === 'Completed') badgeClass = 'completed'; 
        else if (v.status === 'With Doctor') badgeClass = 'active'; 

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold; color:#d63384;">${v.opdId}</td>
            <td style="font-weight:bold; color:#0d6efd;">${v.pid}</td>
            <td>
                <div>${v.patientName}</div>
                <small style="color:#777">${v.age}Y / ${v.gender}</small>
            </td>
            <td>${v.doctor}</td>
            <td><span class="badge ${badgeClass}">${v.status}</span></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn small" onclick="window.printSlip('${v.opdId}')">Print</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function calculateAge() {
    const dobVal = document.getElementById('dob').value;
    if(!dobVal) return;
    // Prevent negative age if future date is selected
    const age = Math.floor((Date.now() - new Date(dobVal).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    document.getElementById('age').value = age >= 0 ? age : 0;
}

function resetForm() { 
    document.getElementById('registrationForm').reset(); 
    loadedPID = null; 
    document.getElementById('patient_id').value = "New Patient"; 
    document.getElementById('search-result').innerHTML = '';
}

function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(t) { t.innerText = msg; t.className = "show"; setTimeout(() => t.className = "", 3000); } 
}

window.printSlip = function(opdId) {
    const v = db_visits.find(x => x.opdId === opdId);
    if(!v) { alert("Record not found for printing"); return; }
    
    const win = window.open('', '', 'height=500,width=400');
    win.document.write(`
        <html><body style="font-family:sans-serif; padding:20px; text-align:center;">
        <h3>MSN Cataract & IOL Hospital</h3>
        <p>Tilak Deka Road, Nagaon</p>
        <hr>
        <h2 style="margin:5px;">${v.opdId}</h2>
        <p><strong>PID:</strong> ${v.pid}</p>
        <p><strong>Name:</strong> ${v.patientName}</p>
        <p><strong>Age/Sex:</strong> ${v.age} / ${v.gender}</p>
        <p><strong>Date:</strong> ${v.date}</p>
        <p><strong>Assigned Doc:</strong> ${v.doctor}</p>
        <hr>
        <p style="font-size:12px">Please show this slip to the Optometrist.</p>
        </body></html>
    `);
    win.print();
};
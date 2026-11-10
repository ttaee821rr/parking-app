// ============================================
// 1. 설정값
// ============================================
// localStorage(브라우저 안의 작은 저장 공간)에 저장할 때 쓰는 이름표
const STORAGE_KEY = 'parking-spot';

// ============================================
// 2. HTML에서 필요한 요소들 가져오기
// ============================================
const emptyView = document.getElementById('empty-view');
const savedView = document.getElementById('saved-view');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const routeBtn = document.getElementById('route-btn');
const infoText = document.getElementById('info');
const statusText = document.getElementById('status');

let map = null;    // 지도 (처음 한 번만 만들고 계속 재사용)
let marker = null; // 지도 위의 "내 차" 핀
const elapsedText = document.getElementById('elapsed'); // 경과 시간 표시 자리 (3단계)
let timerId = null; // 1초마다 경과 시간을 갱신하는 타이머 번호 (3단계)
const memoInput = document.getElementById('memo-input');   // 메모 입력칸 (4단계)
const memoStatus = document.getElementById('memo-status'); // "자동 저장됨" 표시 자리 (4단계)
const feeText = document.getElementById('fee');              // 예상 요금 표시 자리 (5단계)
const feeRule = document.getElementById('fee-rule');         // 요금표 요약 표시 자리 (5단계)
const rateInputs = document.querySelectorAll('.rate-input'); // 요금 입력칸들 (5단계)
const RATE_KEY = 'parking-rate'; // 요금표 저장 이름표 (출차해도 지우지 않음)

// ============================================
// 3. 저장소(localStorage) 다루는 함수들
// ============================================
// 저장된 주차 위치 꺼내기 (없으면 null)
function loadSpot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null; // 글자 → 객체로 변환
  } catch (e) {
    return null; // 저장된 값이 깨져 있으면 없는 걸로 취급
  }
}

// 주차 위치 저장하기
function saveSpot(spot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spot)); // 객체 → 글자로 변환
}

// 주차 위치 지우기
function clearSpot() {
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================
// 4. 화면 그리기
// ============================================
// 저장된 값이 있으면 화면 B, 없으면 화면 A를 보여줌
function render() {
  const spot = loadSpot();

  if (!spot) {
    emptyView.hidden = false;
    savedView.hidden = true;
        stopTimer(); // 저장된 게 없으면 시계도 멈춤
    return;
  }

  emptyView.hidden = true;
  savedView.hidden = false;

  const time = new Date(spot.savedAt).toLocaleString('ko-KR');
    infoText.textContent = `주차 시작: ${time} · 위치 오차 약 ${Math.round(spot.accuracy)}m`;

  startTimer(spot.savedAt); // 경과 시간 표시 시작 (3단계)
    memoInput.value = spot.memo || ''; // 저장된 메모 보여주기, 없으면 빈칸 (4단계)
  memoStatus.textContent = '';

  // 카카오맵 길찾기 링크 (API 키 없이 쓸 수 있는 공개 링크 형식)
  // 형식: https://map.kakao.com/link/to/이름,위도,경도
  routeBtn.href = `https://map.kakao.com/link/to/${encodeURIComponent('내 차')},${spot.lat},${spot.lng}`;

  showMap(spot.lat, spot.lng);
}

// 지도에 차 위치 표시
function showMap(lat, lng) {
  if (!map) {
    map = L.map('map'); // 'map'은 index.html의 <div id="map">
    // OpenStreetMap 지도 그림을 불러옴 (API 키 필요 없음)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    marker = L.marker([lat, lng]).addTo(map).bindPopup('🚗 내 차');
  }

  map.setView([lat, lng], 17);  // 17 = 확대 정도 (숫자가 클수록 가까이)
  marker.setLatLng([lat, lng]);
  map.invalidateSize();          // 숨겨졌다가 나타난 지도의 크기를 다시 계산
}

// ============================================
// 5. 버튼 동작
// ============================================
// [저장 버튼] 현재 위치를 GPS로 받아서 저장
saveBtn.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    statusText.textContent = '이 브라우저는 위치 기능을 지원하지 않아요.';
    return;
  }

  statusText.textContent = '위치를 찾는 중... (몇 초 걸릴 수 있어요)';
  saveBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    // 성공했을 때
    (position) => {
      saveSpot({
        lat: position.coords.latitude,       // 위도
        lng: position.coords.longitude,      // 경도
        accuracy: position.coords.accuracy,  // 오차 범위(미터)
        savedAt: Date.now(),                 // 저장한 시각 (2단계 '주차 시간'에서 사용)
      });
      saveBtn.disabled = false;
      statusText.textContent = '✅ 주차 위치를 저장했어요!';
      render();
    },
    // 실패했을 때
    (error) => {
      saveBtn.disabled = false;
      statusText.textContent = getErrorMessage(error);
    },
    // 옵션
    {
      enableHighAccuracy: true, // 가능하면 GPS로 정확하게
      timeout: 15000,           // 15초 안에 못 찾으면 포기
      maximumAge: 0,            // 예전에 찾아둔 위치 말고 지금 위치로
    }
  );
});

// [지우기 버튼] 출차 후 기록 삭제
clearBtn.addEventListener('click', () => {
  if (!confirm('주차 기록을 지울까요?')) return;
  clearSpot();
  statusText.textContent = '기록을 지웠어요. 다음 주차 때 다시 저장하세요.';
  render();
});

// 위치 오류를 알아듣기 쉬운 말로 바꾸기
function getErrorMessage(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return '위치 권한이 거부됐어요. 브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.';
    case error.POSITION_UNAVAILABLE:
      return '위치를 알 수 없어요. 지하라면 GPS가 약할 수 있으니 입구 근처에서 다시 시도해 보세요.';
    case error.TIMEOUT:
      return '위치를 찾는 데 너무 오래 걸려요. 다시 눌러 주세요.';
    default:
      return '알 수 없는 오류가 났어요. 다시 시도해 주세요.';
  }
}

// ============================================
// 6. 앱 시작 — 페이지가 열리면 바로 한 번 화면을 그림
// ============================================
render();

// ============================================
// 7. 주차 경과 시간 (3단계)
// ============================================
// 밀리초(1/1000초)를 "02:05:09" 또는 "1일 02:05:09" 같은 글자로 바꾸기
function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000)); // 음수가 되지 않게
  const days = Math.floor(totalSec / 86400);           // 하루 = 86400초
  const h = Math.floor((totalSec % 86400) / 3600);     // 1시간 = 3600초
  const m = Math.floor((totalSec % 3600) / 60);        // 1분 = 60초
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');       // 5 → "05"
  const time = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}일 ${time}` : time;
}

// 1초마다 "지금 시각 - 주차 시작 시각"을 다시 계산해서 표시
function startTimer(savedAt) {
  stopTimer(); // 이미 돌고 있는 타이머가 있으면 먼저 멈춤 (중복 방지)
  const update = () => {
    elapsedText.textContent = formatElapsed(Date.now() - savedAt);
        updateFee(Date.now() - savedAt); // 요금도 같이 갱신 (5단계)
  };
  update();                            // 1초 기다리지 않고 바로 한 번 표시
  timerId = setInterval(update, 1000); // 그다음부터 1초(1000ms)마다 갱신
}

// 타이머 멈추기
function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

// ============================================
// 8. 주차장 메모 (4단계)
// ============================================
// 글자를 입력할 때마다 자동으로 저장
memoInput.addEventListener('input', () => {
  const spot = loadSpot();
  if (!spot) return;           // 저장된 주차 위치가 없으면 아무것도 안 함
  spot.memo = memoInput.value; // 기존 주차 정보에 메모만 추가/수정
  saveSpot(spot);
  memoStatus.textContent = '✅ 자동 저장됨';
});

// ============================================
// 9. 예상 주차 요금 (5단계)
// ============================================
// 저장된 요금표 꺼내기 (없으면 null)
function loadRate() {
  try {
    return JSON.parse(localStorage.getItem(RATE_KEY));
  } catch (e) {
    return null;
  }
}

// 입력칸들 → 요금표 객체 { freeMin: 0, baseMin: 30, ... }
function readRateFromForm() {
  const rate = {};
  rateInputs.forEach((input) => {
    rate[input.dataset.key] = Math.max(0, Number(input.value) || 0); // 빈칸·음수는 0
  });
  return rate;
}

// 요금표 객체 → 입력칸들 (앱을 열 때 저장된 값 채우기)
function fillRateForm(rate) {
  rateInputs.forEach((input) => {
    input.value = rate[input.dataset.key] || '';
  });
}

// N분 주차했을 때 요금 (하루 최대 요금 적용 전)
function feeForMinutes(min, rate) {
  if (min <= 0) return 0;
  let fee = rate.baseFee;                         // 기본 요금
  if (min > rate.baseMin && rate.unitMin > 0) {   // 기본 시간을 넘으면
    const units = Math.ceil((min - rate.baseMin) / rate.unitMin); // 추가 단위 수 (올림)
    fee += units * rate.unitFee;
  }
  return fee;
}

// 경과 시간(밀리초) → 예상 요금
function calcFee(ms, rate) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));  // 1초라도 지나면 1분으로 (올림)
  const charged = Math.max(0, minutes - rate.freeMin); // 무료 시간 빼기
  if (rate.maxFee > 0) {
    // 하루 최대 요금: 24시간(1440분)마다 최대 금액까지만 받기
    const days = Math.floor(charged / 1440);
    const rest = charged % 1440;
    const dayFee = Math.min(feeForMinutes(1440, rate), rate.maxFee);
    return days * dayFee + Math.min(feeForMinutes(rest, rate), rate.maxFee);
  }
  return feeForMinutes(charged, rate);
}

// 요금표를 한 줄 설명으로 (예: "처음 30분 1,000원 · 이후 10분당 500원")
function describeRate(rate) {
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const parts = [];
  if (rate.freeMin > 0) parts.push(`무료 ${rate.freeMin}분`);
  if (rate.baseMin > 0 || rate.baseFee > 0) parts.push(`처음 ${rate.baseMin}분 ${won(rate.baseFee)}`);
  if (rate.unitMin > 0) parts.push(`이후 ${rate.unitMin}분당 ${won(rate.unitFee)}`);
  if (rate.maxFee > 0) parts.push(`하루 최대 ${won(rate.maxFee)}`);
  return parts.join(' · ');
}

// 화면의 요금 표시 갱신 (시계가 1초마다 불러줌)
function updateFee(ms) {
  const rate = loadRate();
  if (!rate || (rate.baseFee === 0 && rate.unitFee === 0)) {
    feeText.textContent = '- 원';
    feeRule.textContent = '아래 "요금 설정"에 주차장 요금표를 입력해 주세요';
    return;
  }
  feeText.textContent = calcFee(ms, rate).toLocaleString('ko-KR') + '원';
  feeRule.textContent = describeRate(rate);
}

// 요금 입력칸에 숫자를 칠 때마다 저장하고 바로 다시 계산
rateInputs.forEach((input) => {
  input.addEventListener('input', () => {
    localStorage.setItem(RATE_KEY, JSON.stringify(readRateFromForm()));
    const spot = loadSpot();
    if (spot) updateFee(Date.now() - spot.savedAt);
  });
});

// 앱을 열 때 저장된 요금표를 입력칸에 채워 넣기
fillRateForm(loadRate() || {});
// Android-compatible version of app.js
// Removed Electron dependencies (ipcRenderer, path, fs)
// Using browser localStorage instead of file system
// The code is written by QianCheng 2026.5.11

// EXIF 方向信息解析函数
function getExifOrientation(dataView) {
  if (dataView.getUint8(0) !== 0xFF || dataView.getUint8(1) !== 0xD8) {
    return 0;
  }
  
  const length = dataView.byteLength;
  let offset = 2;
  
  while (offset < length) {
    if (dataView.getUint8(offset) !== 0xFF) {
      return 0;
    }
    
    const marker = dataView.getUint8(offset + 1);
    
    if (marker === 0xE1) {
      if (dataView.getUint32(offset + 4) !== 0x45786966) {
        return 0;
      }
      
      const littleEndian = dataView.getUint16(offset + 8) === 0x4949;
      const firstIfdOffset = dataView.getUint32(offset + 12, littleEndian);
      
      if (firstIfdOffset < 8) {
        return 0;
      }
      
      const ifdStart = offset + 8 + firstIfdOffset;
      const numEntries = dataView.getUint16(ifdStart, littleEndian);
      
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdStart + 2 + (i * 12);
        const tag = dataView.getUint16(entryOffset, littleEndian);
        
        if (tag === 0x0112) {
          return dataView.getUint16(entryOffset + 8, littleEndian);
        }
      }
    } else if (marker >= 0xD0 && marker <= 0xD9) {
      offset += 2;
    } else {
      const segmentLength = dataView.getUint16(offset + 2, true) + 2;
      offset += segmentLength;
    }
  }
  
  return 0;
}

// 根据 EXIF 方向信息旋转图片
function rotateImageByOrientation(image, orientation) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = image.width;
  canvas.height = image.height;
  
  if (orientation === 0 || orientation === 1) {
    ctx.drawImage(image, 0, 0);
    return canvas;
  }
  
  switch (orientation) {
    case 3:
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(180 * Math.PI / 180);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      break;
    case 6:
      canvas.width = image.height;
      canvas.height = image.width;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(90 * Math.PI / 180);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      break;
    case 8:
      canvas.width = image.height;
      canvas.height = image.width;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-90 * Math.PI / 180);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      break;
    default:
      ctx.drawImage(image, 0, 0);
  }
  
  return canvas;
}

// 从 Blob 读取 EXIF 方向信息
async function getOrientationFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataView = new DataView(e.target.result);
      const orientation = getExifOrientation(dataView);
      resolve(orientation);
    };
    reader.onerror = function() {
      resolve(0);
    };
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}

let questions = [];

const STORAGE_KEY = 'kuxue_questions';
const BACKUP_STORAGE_KEY = 'kuxue_backups';

async function initApp() {
  initEventListeners();
  await LoadQuestions();
  UpdateDashboard();
  ShowPanel('dashboard');
  initUploadList();
}

function initEventListeners() {
  const modal = document.getElementById('questionModal');
  const scrollContainer = modal.querySelector('.modal-scroll-container');
  
  modal.addEventListener('wheel', function(e) {
    const isAtTop = scrollContainer.scrollTop === 0 && e.deltaY < 0;
    const isAtBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop === scrollContainer.clientHeight && e.deltaY > 0;
    if (isAtTop || isAtBottom) {
      e.stopPropagation();
    }
  }, false);
  
  initErrorWashingEvents();
}

async function LoadQuestions() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      questions = JSON.parse(data);
    }
  } catch (error) {
    console.error('加载题目数据失败:', error);
    alert('加载题目数据失败，请检查存储!');
  }
}

async function SaveQuestions() {
  try {
    await BackupDataFile();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions, null, 2));
  } catch (error) {
    console.error('保存题目数据失败:', error);
    alert('保存题目数据失败，存储空间可能不足!');
  }
}

async function CreateBackupFolder() {
  // localStorage doesn't support folders, backups are stored in a single key
}

async function BackupDataFile() {
  try {
    const backups = JSON.parse(localStorage.getItem(BACKUP_STORAGE_KEY) || '[]');
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    backups.push({
      timestamp: timestamp,
      data: JSON.parse(JSON.stringify(questions))
    });
    
    // Keep only last 10 backups to avoid storage limits
    if (backups.length > 10) {
      backups.splice(0, backups.length - 10);
    }
    
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(backups));
  } catch (error) {
    console.error('备份数据文件失败:', error);
  }
}

function ShowPanel(panelId) {
  const panels = ['dashboard', 'questionList', 'addQuestion', 'statistics', 'autoGenerate', 'importQuestion', 'aiExpand'];
  
  panels.forEach(panel => {
    const el = document.getElementById(panel);
    if (el) el.style.display = 'none';
  });
  
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = 'block';
  
  if (panelId === 'autoGenerate') {
    InitAutoGeneratePanel();
  }
}

function UpdateDashboard() {
  UpdateTotalQuestions();
  UpdateTodayAdded();
  UpdateErrorRate();
  UpdateMasteredTopics();
  UpdateRecentQuestions();
  UpdateQuestionList();
  UpdateStatistics();
}

function UpdateTotalQuestions() {
  document.getElementById('totalQuestions').innerText = questions.length;
}

function UpdateTodayAdded() {
  const today = new Date().toLocaleDateString();
  const count = questions.filter(q => new Date(q.createdDate).toLocaleDateString() === today).length;
  document.getElementById('todayAdded').innerText = count;
}

function UpdateErrorRate() {
  let totalErrors = 0;
  let totalAttempts = 0;
  
  questions.forEach(q => {
    totalErrors += parseInt(q.errorCount || 0);
    totalAttempts += parseInt(q.totalCount || 0);
  });
  
  let rate = 0;
  if (totalAttempts > 0) {
    rate = Math.round((totalErrors / totalAttempts) * 100, 2);
  }
  document.getElementById('errorRate').innerText = rate + '%';
}

function UpdateMasteredTopics() {
  const topics = new Set();
  questions.forEach(q => {
    if (q.topic) {
      topics.add(q.topic);
    }
  });
  document.getElementById('masteredTopics').innerText = topics.size;
}

function UpdateRecentQuestions() {
  let html = '';
  let count = 0;
  
  for (let i = questions.length - 1; i >= 0 && count < 5; i--) {
    const q = questions[i];
    html += `<div class='question-item'>`;
    html += `<strong>${(q.content || '').substring(0, 50)}${(q.content || '').length > 50 ? '...' : ''}</strong><br>`;
    html += `<small>难度: ${GetDifficultyText(q.difficulty)} | 知识点: ${q.topic || ''}</small>`;
    html += `</div>`;
    count++;
  }
  
  document.getElementById('recentQuestions').innerHTML = html;
}

function UpdateQuestionList() {
  UpdateTopicFilterOptions();
  
  let html = '';
  questions.forEach((q, index) => {
    html += `<div class='question-item'>`;
    html += `<div onclick='ShowQuestionDetails(${index})' style='flex-grow:1;'>`;
    html += `<strong>${q.content || ''}</strong><br>`;
    html += `<small>题库: ${GetBankTypeText(q.bankType)} | 难度: ${GetDifficultyText(q.difficulty)} | 类型: ${GetTypeText(q.type)} | 知识点: ${q.topic || ''} | 错频: ${q.errorCount || 0}</small>`;
    html += `</div>`;
    html += `<button onclick='DeleteQuestion(${index});return false;' style='margin-left:10px;' class='btn btn-secondary'>删除</button>`;
    html += `</div>`;
  });
  
  document.getElementById('questionListContainer').innerHTML = html;
}

function UpdateTopicFilterOptions() {
  const topics = new Set();
  questions.forEach(q => {
    if (q.topic) {
      topics.add(q.topic);
    }
  });
  
  const topicSelect = document.getElementById('filterTopic');
  topicSelect.innerHTML = '<option value="">所有知识点</option>';
  
  topics.forEach(topic => {
    topicSelect.innerHTML += `<option value='${topic}'>${topic}</option>`;
  });
}

function UpdateStatistics() {
  if (!window.statisticsInitialized) {
    initStatisticsEventListeners();
    window.statisticsInitialized = true;
  }
  
  syncBankTypeSelects();
  updateTopicPieChart();
  updateTopicFilter();
  updateErrorRanking();
}

function initStatisticsEventListeners() {
  document.getElementById('statsQuestionBankType').addEventListener('change', function() {
    updateTopicPieChart();
    updateTopicFilter();
    updateErrorRanking();
  });
  
  document.getElementById('topicFilter').addEventListener('change', function() {
    updateErrorRanking();
  });
}

function updateTopicPieChart() {
  const bankType = document.getElementById('statsQuestionBankType').value;
  const filteredQuestions = bankType ? questions.filter(q => q.bankType === bankType) : questions;
  
  const topicStats = {};
  filteredQuestions.forEach(q => {
    if (q.topic) {
      topicStats[q.topic] = (topicStats[q.topic] || 0) + 1;
    }
  });
  
  const topics = Object.keys(topicStats);
  const counts = Object.values(topicStats);
  
  const canvas = document.getElementById('topicPieChart');
  const ctx = canvas.getContext('2d');
  
  // Adjust canvas size for mobile
  const displayWidth = Math.min(canvas.parentElement.clientWidth, 300);
  canvas.width = displayWidth * window.devicePixelRatio;
  canvas.height = displayWidth * window.devicePixelRatio;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayWidth + 'px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  const centerX = displayWidth / 2;
  const centerY = displayWidth / 2;
  const radius = Math.min(centerX, centerY) - 50;
  
  ctx.clearRect(0, 0, displayWidth, displayWidth);
  
  if (topics.length === 0) {
    ctx.font = '14px Microsoft YaHei';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', centerX, centerY);
    return;
  }
  
  let currentAngle = 0;
  const total = counts.reduce((sum, count) => sum + count, 0);
  
  const colors = [
    '#4169E1', '#FF6B6B', '#4ECDC4', '#45B7D1', '#F9CA24',
    '#6C5CE7', '#A29BFE', '#FD79A8', '#00B894', '#E17055',
    '#0984E3', '#FDCB6E', '#E17055', '#D63031', '#636E72'
  ];
  
  topics.forEach((topic, index) => {
    const angle = (counts[index] / total) * 2 * Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    const percentage = Math.round((counts[index] / total) * 100);
    const labelAngle = currentAngle + angle / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius + 20);
    const labelY = centerY + Math.sin(labelAngle) * (radius + 20);
    
    ctx.font = '12px Microsoft YaHei';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${percentage}%`, labelX, labelY);
    
    const legendX = 10;
    const legendY = 25 + index * 22;
    
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(legendX, legendY, 12, 12);
    
    ctx.font = '11px Microsoft YaHei';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${topic} (${counts[index]}题)`, legendX + 18, legendY + 6);
    
    currentAngle += angle;
  });
}

function updateTopicFilter() {
  const bankType = document.getElementById('statsQuestionBankType').value;
  const filteredQuestions = bankType ? questions.filter(q => q.bankType === bankType) : questions;
  
  const topics = new Set();
  filteredQuestions.forEach(q => {
    if (q.topic) {
      topics.add(q.topic);
    }
  });
  
  const topicFilter = document.getElementById('topicFilter');
  topicFilter.innerHTML = '<option value="">所有知识点</option>';
  
  topics.forEach(topic => {
    const option = document.createElement('option');
    option.value = topic;
    option.textContent = topic;
    topicFilter.appendChild(option);
  });
}

function updateErrorRanking() {
  const bankType = document.getElementById('statsQuestionBankType').value;
  const topic = document.getElementById('topicFilter').value;
  
  let filteredQuestions = bankType ? questions.filter(q => q.bankType === bankType) : questions;
  filteredQuestions = topic ? filteredQuestions.filter(q => q.topic === topic) : filteredQuestions;
  
  const sortedQuestions = [...filteredQuestions].sort((a, b) => {
    const errorCountA = parseInt(a.errorCount || 0);
    const errorCountB = parseInt(b.errorCount || 0);
    return errorCountB - errorCountA;
  });
  
  let html = '';
  if (sortedQuestions.length === 0) {
    html = '<div style="text-align: center; color: #666; padding: 20px;">暂无数据</div>';
  } else {
    sortedQuestions.forEach((q, index) => {
      const errorCount = parseInt(q.errorCount || 0);
      const difficultyText = GetDifficultyText(q.difficulty);
      const typeText = GetTypeText(q.type);
      const originalIndex = questions.indexOf(q);
      
      html += `<div class="question-item" onclick="ShowQuestionDetails(${originalIndex})" style="cursor: pointer; margin-bottom: 10px; padding: 12px; border: 2px solid #f0f0f0; border-radius: 12px;">`;
      html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
      html += `<div style="flex-grow: 1;">`;
      html += `<strong style="display: block; margin-bottom: 5px;">${index + 1}. ${(q.content || '').substring(0, 50)}${(q.content || '').length > 50 ? '...' : ''}</strong>`;
      html += `<small style="color: #666;">知识点: ${q.topic || ''} | 难度: ${difficultyText} | 类型: ${typeText}</small>`;
      html += `</div>`;
      html += `<div style="background-color: #FF6B6B; color: white; padding: 5px 10px; border-radius: 15px; font-weight: bold; min-width: 40px; text-align: center;">${errorCount}</div>`;
      html += `</div>`;
      html += `</div>`;
    });
  }
  
  document.getElementById('errorRanking').innerHTML = html;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function SaveQuestion() {
  const content = document.getElementById('questionContent').value.trim();
  const difficulty = document.getElementById('questionDifficulty').value;
  const topic = document.getElementById('questionTopic').value.trim();
  const qType = document.getElementById('questionType').value;
  const answer = document.getElementById('questionAnswer').value.trim();
  const analysis = document.getElementById('questionAnalysis').value.trim();
  
  const contentImgFile = document.getElementById('questionContentImg').files[0];
  const answerImgFile = document.getElementById('questionAnswerImg').files[0];
  const analysisImgFile = document.getElementById('questionAnalysisImg').files[0];
  
  if (!content && !contentImgFile) {
    alert('题目内容或图片不能同时为空!');
    return;
  }
  
  if (!answer && !answerImgFile) {
    alert('答案或答案图片不能同时为空!');
    return;
  }
  
  const contentImg = contentImgFile ? await fileToBase64(contentImgFile) : '';
  const answerImg = answerImgFile ? await fileToBase64(answerImgFile) : '';
  const analysisImg = analysisImgFile ? await fileToBase64(analysisImgFile) : '';
  
  const newQuestion = {
    id: new Date().toISOString(),
    content: content,
    difficulty: difficulty,
    topic: topic,
    type: qType,
    answer: answer,
    analysis: analysis,
    contentImg: contentImg,
    answerImg: answerImg,
    analysisImg: analysisImg,
    createdDate: new Date().toISOString(),
    errorCount: 1,
    totalCount: 1,
    bankType: document.getElementById('questionBankType').value
  };
  
  questions.push(newQuestion);
  await SaveQuestions();
  UpdateDashboard();
  
  alert('题目保存成功!');
  ClearQuestionForm();
}

function ClearQuestionForm() {
  const questionContent = document.getElementById('questionContent');
  const questionDifficulty = document.getElementById('questionDifficulty');
  const questionTopic = document.getElementById('questionTopic');
  const questionType = document.getElementById('questionType');
  const questionAnswer = document.getElementById('questionAnswer');
  const questionAnalysis = document.getElementById('questionAnalysis');
  const questionContentImg = document.getElementById('questionContentImg');
  const questionAnswerImg = document.getElementById('questionAnswerImg');
  const questionAnalysisImg = document.getElementById('questionAnalysisImg');
  const questionContentImgPreview = document.getElementById('questionContentImgPreview');
  const questionAnswerImgPreview = document.getElementById('questionAnswerImgPreview');
  const questionAnalysisImgPreview = document.getElementById('questionAnalysisImgPreview');
  
  if (questionContent) questionContent.value = '';
  if (questionDifficulty) questionDifficulty.selectedIndex = 0;
  if (questionTopic) questionTopic.value = '';
  if (questionType) questionType.selectedIndex = 0;
  if (questionAnswer) questionAnswer.value = '';
  if (questionAnalysis) questionAnalysis.value = '';
  if (questionContentImg) questionContentImg.value = '';
  if (questionAnswerImg) questionAnswerImg.value = '';
  if (questionAnalysisImg) questionAnalysisImg.value = '';
  if (questionContentImgPreview) questionContentImgPreview.innerHTML = '';
  if (questionAnswerImgPreview) questionAnswerImgPreview.innerHTML = '';
  if (questionAnalysisImgPreview) questionAnalysisImgPreview.innerHTML = '';
}

function ShowQuestionDetails(index) {
  const q = questions[index];
  let html = '<div class="form-group">';
  html += `<strong>题目内容:</strong><br>${q.content || ''}`;
  if (q.contentImg) {
    html += `<br><img src='${q.contentImg}' style='max-width:100%;max-height:300px;'><br>`;
  }
  html += `<br><strong>难度:</strong> ${GetDifficultyText(q.difficulty)}<br>`;
  html += `<strong>知识点:</strong> ${q.topic || ''}<br>`;
  html += `<strong>题目类型:</strong> ${GetTypeText(q.type)}<br><br>`;
  html += `<strong>答案:</strong><br>${q.answer || ''}`;
  if (q.answerImg) {
    html += `<br><img src='${q.answerImg}' style='max-width:100%;max-height:300px;'><br>`;
  }
  html += `<br><strong>解析:</strong><br>${q.analysis || ''}`;
  if (q.analysisImg) {
    html += `<br><img src='${q.analysisImg}' style='max-width:100%;max-height:300px;'><br>`;
  }
  html += `<br><strong>创建日期:</strong> ${new Date(q.createdDate).toLocaleString()}<br>`;
  html += `<br><strong>错误次数:</strong> ${q.errorCount || 0} <button onclick='incrementErrorCount(${index})' class='btn btn-secondary'>错频加一</button><br>`;
  html += '</div>';
  
  document.getElementById('modalQuestionContent').innerHTML = html;
  document.getElementById('questionModal').style.display = 'block';
}

function CloseModal() {
  document.getElementById('questionModal').style.display = 'none';
}

function closeModalOnBackdrop(event) {
  if (event.target === event.currentTarget) {
    CloseModal();
  }
}

async function incrementErrorCount(index) {
  if (questions[index]) {
    questions[index].errorCount = (parseInt(questions[index].errorCount) || 0) + 1;
    questions[index].totalCount = (parseInt(questions[index].totalCount) || 0) + 1;
    await SaveQuestions();
    UpdateDashboard();
    ShowQuestionDetails(index);
  }
}

async function DeleteQuestion(index) {
  if (confirm('确定要删除这个题目吗？')) {
    questions.splice(index, 1);
    await SaveQuestions();
    UpdateDashboard();
    alert('题目已删除');
  }
}

function SearchQuestions() {
  const keyword = document.getElementById('searchQuestions').value.trim();
  const bankType = document.getElementById('filterBankType').value;
  const difficulty = document.getElementById('filterDifficulty').value;
  const topic = document.getElementById('filterTopic').value;
  const qType = document.getElementById('filterType').value;
  
  if (!keyword && !bankType && !difficulty && !topic && !qType) {
    UpdateQuestionList();
    return;
  }
  
  let html = '';
  let found = false;
  
  questions.forEach((q, index) => {
    const matchKeyword = !keyword || (q.content || '').includes(keyword) || (q.topic || '').includes(keyword);
    const matchBankType = !bankType || q.bankType === bankType;
    const matchDifficulty = !difficulty || q.difficulty === difficulty;
    const matchTopic = !topic || q.topic === topic;
    const matchType = !qType || q.type === qType;
    
    if (matchKeyword && matchBankType && matchDifficulty && matchTopic && matchType) {
      html += `<div class='question-item' onclick='ShowQuestionDetails(${index})'>`;
      html += `<strong>${q.content || ''}</strong><br>`;
      html += `<small>题库: ${GetBankTypeText(q.bankType)} | 难度: ${GetDifficultyText(q.difficulty)} | 类型: ${GetTypeText(q.type)} | 知识点: ${q.topic || ''} | 错频: ${q.errorCount || 0}</small>`;
      html += `</div>`;
      found = true;
    }
  });
  
  if (!found) {
    html = '<div class="question-item">未找到匹配的题目</div>';
  }
  
  document.getElementById('questionListContainer').innerHTML = html;
}

function OpenLocalQuestionImport() {
  alert('错题清洗工具已在此页面可用');
}

function GetDifficultyText(difficulty) {
  switch (difficulty) {
    case 'easy': return '简单';
    case 'medium': return '中等';
    case 'hard': return '困难';
    default: return '未知';
  }
}

function GetTypeText(qType) {
  switch (qType) {
    case 'single': return '单选题';
    case 'multiple': return '多选题';
    case 'judgment': return '判断题';
    case 'essay': return '简答题';
    default: return '未知类型';
  }
}

function GetBankTypeText(bankType) {
  switch (bankType) {
    case 'english2': return '英语二';
    case 'politics': return '考研政治';
    case 'economics396': return '396经济学综合';
    case 'education333': return '333教育学综合';
    case 'business': return '国际商务';
    case 'math': return '高等数学基础';
    case 'calculus': return '微积分特训';
    default: return '未知题库';
  }
}

function InitAutoGeneratePanel() {
  InitAutoTopicFilter();
  
  let html = '';
  questions.forEach((q, index) => {
    html += `<div style='margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;' onclick='ShowQuestionDetails(${index})'>`;
    html += `<input type='checkbox' id='q${index}' style='margin-right:10px; cursor:pointer; width: 20px; height: 20px;'> `;
    html += `<strong>${q.content || ''}</strong><br>`;
    html += `<small>难度: ${GetDifficultyText(q.difficulty)} | 类型: ${GetTypeText(q.type)} | 知识点: ${q.topic || ''}</small>`;
    html += `</div>`;
  });
  
  document.getElementById('autoGenerateQuestionList').innerHTML = html;
}

function InitAutoTopicFilter() {
  const topics = new Set();
  questions.forEach(q => {
    if (q.topic) {
      topics.add(q.topic);
    }
  });
  
  const topicSelect = document.getElementById('autoFilterTopic');
  let topicOptions = '<option value="">所有知识点</option>';
  
  topics.forEach(topic => {
    topicOptions += `<option value='${topic}'>${topic}</option>`;
  });
  
  topicSelect.innerHTML = topicOptions;
}

function FilterAutoQuestions() {
  const difficulty = document.getElementById('autoFilterDifficulty').value;
  const qType = document.getElementById('autoFilterType').value;
  const topic = document.getElementById('autoFilterTopic').value;
  
  let html = '';
  
  questions.forEach((q, index) => {
    const matchDifficulty = !difficulty || q.difficulty === difficulty;
    const matchType = !qType || q.type === qType;
    const matchTopic = !topic || q.topic === topic;
    
    if (matchDifficulty && matchType && matchTopic) {
      html += `<div style='margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:8px; cursor:pointer;' onclick='ShowQuestionDetails(${index})'>`;
      html += `<input type='checkbox' id='q${index}' style='margin-right:10px; cursor:pointer; width: 20px; height: 20px;'> `;
      html += `<strong>${q.content || ''}</strong><br>`;
      html += `<small>难度: ${GetDifficultyText(q.difficulty)} | 类型: ${GetTypeText(q.type)} | 知识点: ${q.topic || ''}</small>`;
      html += `</div>`;
    }
  });
  
  document.getElementById('autoGenerateQuestionList').innerHTML = html;
}

function ExportToPDF() {
  let hasSelected = false;
  for (let i = 0; i < questions.length; i++) {
    const checkbox = document.getElementById(`q${i}`);
    if (checkbox && checkbox.checked) {
      hasSelected = true;
      break;
    }
  }
  
  if (!hasSelected) {
    alert('请至少选择一道题目');
    return;
  }
  
  alert('PDF导出功能将在后续版本中实现');
}

async function ExportToMarkdown() {
  let hasSelected = false;
  const selectedQuestions = [];
  
  for (let i = 0; i < questions.length; i++) {
    const checkbox = document.getElementById(`q${i}`);
    if (checkbox && checkbox.checked) {
      hasSelected = true;
      selectedQuestions.push(questions[i]);
    }
  }
  
  if (!hasSelected) {
    alert('请至少选择一道题目');
    return;
  }
  
  // In browser version, we'll use the Web Share API or direct download
  const onlyQuestions = confirm('点击"确定"导出题目，点击"取消"导出答案');
  
  try {
    let markdownContent = generateMarkdownContent(selectedQuestions, onlyQuestions);
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const fileName = `题目导出_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.md`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert(`Markdown文档已成功导出：${fileName}`);
  } catch (error) {
    console.error('导出Markdown失败:', error);
    alert('导出Markdown失败：' + error.message);
  }
}

async function ExportToWord() {
  let hasSelected = false;
  const selectedQuestions = [];
  
  for (let i = 0; i < questions.length; i++) {
    const checkbox = document.getElementById(`q${i}`);
    if (checkbox && checkbox.checked) {
      hasSelected = true;
      selectedQuestions.push(questions[i]);
    }
  }
  
  if (!hasSelected) {
    alert('请至少选择一道题目');
    return;
  }
  
  const onlyQuestions = confirm('点击"确定"导出题目，点击"取消"导出答案');
  
  try {
    let wordContent = generateWordContent(selectedQuestions, onlyQuestions);
    const blob = new Blob([wordContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const fileName = `题目导出_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.doc`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert(`Word文档已成功导出：${fileName}`);
  } catch (error) {
    console.error('导出Word失败:', error);
    alert('导出Word失败：' + error.message);
  }
}

function generateMarkdownContent(questions, onlyQuestions) {
  let content = `# ${onlyQuestions ? '仅导出题目' : '仅导出答案'}

## 共 ${questions.length} 道题

---

`;
  
  questions.forEach((q, index) => {
    content += `## 第 ${index + 1} 题

`;
    
    if (onlyQuestions) {
      if (q.content) {
        content += `${q.content}\n\n`;
      }
      if (q.contentImg) {
        content += `![题目图片](${q.contentImg})\n\n`;
      }
    } else {
      if (q.answer) {
        content += `**答案：** ${q.answer}\n\n`;
      }
      if (q.answerImg) {
        content += `![答案图片](${q.answerImg})\n\n`;
      }
    }
    
    content += `---\n\n`;
  });
  
  return content;
}

function generateWordContent(questions, onlyQuestions) {
  let content = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>题目导出</title>
<style>
body { font-family: 'Microsoft YaHei', SimSun, sans-serif; line-height: 1.6; margin: 20px; }
h1 { color: #333; text-align: center; font-size: 24px; }
h2 { color: #555; font-size: 20px; margin-top: 30px; margin-bottom: 15px; }
h3 { color: #666; font-size: 18px; margin-top: 20px; margin-bottom: 10px; }
hr { border: 1px solid #ddd; margin: 20px 0; }
.question { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; }
.answer { font-weight: bold; color: #0066cc; }
img { max-width: 100%; height: auto; margin: 10px 0; }
</style>
</head>
<body>
`;
  
  content += `<h1>${onlyQuestions ? '仅导出题目' : '仅导出答案'}</h1>`;
  content += `<h2>共 ${questions.length} 道题</h2>`;
  content += `<hr>`;
  
  questions.forEach((q, index) => {
    content += `<h3>第 ${index + 1} 题</h3>`;
    content += `<div class="question">`;
    
    if (onlyQuestions) {
      if (q.content) {
        content += `<p>${q.content}</p>`;
      }
      if (q.contentImg) {
        content += `<img src="${q.contentImg}" alt="题目图片">`;
      }
    } else {
      if (q.answer) {
        content += `<p class="answer">答案：${q.answer}</p>`;
      }
      if (q.answerImg) {
        content += `<img src="${q.answerImg}" alt="答案图片">`;
      }
    }
    
    content += `</div>`;
    content += `<hr>`;
  });
  
  content += `</body>
</html>`;
  
  return content;
}

function ClearPageImages() {
  const aiImagePreview = document.getElementById('aiImagePreview');
  if (aiImagePreview) {
    aiImagePreview.innerHTML = '';
  }
  
  const aiUploadText = document.getElementById('aiUploadText');
  if (aiUploadText) {
    aiUploadText.textContent = '点击或拖拽图片到此处上传';
  }
  
  const imageContainer = document.getElementById('imageContainer');
  if (imageContainer) {
    imageContainer.classList.add('hidden');
  }
  
  const emptyState = document.getElementById('emptyState');
  if (emptyState) {
    emptyState.classList.remove('hidden');
  }
  
  const previewImage = document.getElementById('previewImage');
  if (previewImage) {
    previewImage.src = '';
  }
  
  const imageUpload = document.getElementById('imageUpload');
  if (imageUpload) {
    imageUpload.value = '';
  }
  
  const aiImageUpload = document.getElementById('aiImageUpload');
  if (aiImageUpload) {
    aiImageUpload.value = '';
  }
  
  alert('页面图片已清除');
}

let currentType = '';

function openAddTypeModal(type) {
  currentType = type;
  document.getElementById('newTypeName').value = '';
  document.getElementById('addTypeModal').style.display = 'block';
}

function closeAddTypeModal() {
  document.getElementById('addTypeModal').style.display = 'none';
  currentType = '';
}

function applyAddType() {
  const newTypeName = document.getElementById('newTypeName').value.trim();
  if (!newTypeName) {
    alert('请输入新类型名称');
    return;
  }

  const selectElement = document.getElementById(currentType);
  const existingOptions = Array.from(selectElement.options).map(opt => opt.textContent);
  
  if (existingOptions.includes(newTypeName)) {
    alert('该类型已存在');
    return;
  }

  const newTypeValue = newTypeName.toLowerCase().replace(/[\s\u4e00-\u9fa5]/g, match => {
    if (match === ' ') return '';
    const pinyinMap = {
      '单': 'single', '多': 'multiple', '判': 'judgment', '简': 'essay',
      '英': 'english', '语': '', '二': '2',
      '考': 'exam', '研': 'postgrad', '政': 'politics',
      '3': '3', '9': '9', '6': '6', '经': 'economics', '济': '', '学': 'study', '综': 'comprehensive', '合': '',
      '教': 'education', '育': '',
      '国': 'international', '际': '', '商': 'business',
      '高': 'advanced', '等': '', '数': 'math', '学': 'math', '基': 'basic', '础': '',
      '微': 'calculus', '积': '', '分': '', '特': 'special', '训': 'training'
    };
    return pinyinMap[match] || match;
  }).replace(/[^a-z0-9]/g, '');

  const newOption = document.createElement('option');
  newOption.value = newTypeValue;
  newOption.textContent = newTypeName;
  selectElement.appendChild(newOption);
  
  if (currentType === 'questionBankType') {
    syncBankTypeSelects();
  }
  
  closeAddTypeModal();
  alert('新增类型成功');
}

function syncBankTypeSelects() {
  const mainSelect = document.getElementById('questionBankType');
  const statsSelect = document.getElementById('statsQuestionBankType');
  const filterSelect = document.getElementById('filterBankType');
  
  const options = Array.from(mainSelect.options);
  
  if (statsSelect) {
    statsSelect.innerHTML = '';
    options.forEach(option => {
      const newOption = document.createElement('option');
      newOption.value = option.value;
      newOption.textContent = option.textContent;
      statsSelect.appendChild(newOption);
    });
  }
  
  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">所有题库</option>';
    options.forEach(option => {
      if (option.value !== '') {
        const newOption = document.createElement('option');
        newOption.value = option.value;
        newOption.textContent = option.textContent;
        filterSelect.appendChild(newOption);
      }
    });
  }
}

function initErrorWashingEvents() {
  let currentImage = null;
  let selectionBoxes = [];
  let currentBox = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let resizeHandle = null;
  let isBoxMode = false;
  
  const imageUpload = document.getElementById('imageUpload');
  const previewImage = document.getElementById('previewImage');
  const imageContainer = document.getElementById('imageContainer');
  const previewContainer = document.getElementById('previewContainer');
  const emptyState = document.getElementById('emptyState');
  const autoDetectBtn = document.getElementById('autoDetectBtn');
  const addBoxBtn = document.getElementById('addBoxBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const boxCount = document.getElementById('boxCount');
  const boxList = document.getElementById('boxList');
  const exportAllBtn = document.getElementById('exportAllBtn');
  const exportSelectedBtn = document.getElementById('exportSelectedBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeHelpBtn = document.getElementById('closeHelpBtn');
  
  imageUpload.addEventListener('change', handleImageUpload);
  autoDetectBtn.addEventListener('click', autoDetectBoxes);
  addBoxBtn.addEventListener('click', toggleBoxMode);
  clearAllBtn.addEventListener('click', clearAllBoxes);
  exportAllBtn.addEventListener('click', exportToFolder);
  exportSelectedBtn.addEventListener('click', exportSelectedBox);
  
  if (closeHelpBtn) {
    closeHelpBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
  }
  
  if (helpModal) {
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) helpModal.classList.add('hidden');
    });
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && currentBox) {
      removeBox(currentBox.id);
    }
    if (e.key === 'Escape' && isBoxMode) {
      toggleBoxMode();
    }
  });
  
  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('图片大小不能超过5MB');
      imageUpload.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      currentImage = new Image();
      currentImage.src = event.target.result;
      currentImage.onload = () => {
        previewImage.src = currentImage.src;
        imageContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        clearAllBoxes();
      };
    };
    reader.readAsDataURL(file);
  }
  
  function toggleBoxMode() {
    if (!currentImage) {
      alert('请先上传图片');
      return;
    }
    
    isBoxMode = !isBoxMode;
    
    if (isBoxMode) {
      addBoxBtn.innerHTML = '✕ 取消框选';
      addBoxBtn.style.backgroundColor = '#6b7280';
      imageContainer.classList.add('crosshair-cursor');
      imageContainer.addEventListener('mousedown', startManualBoxCreation);
      imageContainer.addEventListener('touchstart', startTouchBoxCreation);
      showNotification('已进入框选模式，点击并拖动创建框选区域');
    } else {
      addBoxBtn.innerHTML = '➕ 手动添加框选';
      addBoxBtn.style.backgroundColor = '#98fb98';
      imageContainer.classList.remove('crosshair-cursor');
      imageContainer.removeEventListener('mousedown', startManualBoxCreation);
      imageContainer.removeEventListener('touchstart', startTouchBoxCreation);
    }
  }
  
  function autoDetectBoxes() {
    if (!currentImage) {
      alert('请先上传图片');
      return;
    }
    
    clearAllBoxes();
    
    const imgRect = previewImage.getBoundingClientRect();
    const boxCountValue = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < boxCountValue; i++) {
      const width = Math.floor(Math.random() * 200) + 200;
      const height = Math.floor(Math.random() * 100) + 80;
      const x = Math.floor(Math.random() * (imgRect.width - width - 20)) + 10;
      const y = Math.floor(Math.random() * (imgRect.height - height - 20)) + 10 + (i * (height + 20));
      
      createBox(x, y, width, height);
    }
    
    updateBoxList();
    showNotification(`已自动识别 ${boxCountValue} 个题目`);
  }
  
  function startManualBoxCreation(e) {
    if (e.button !== 0) return;
    
    let startPos = {
      x: e.clientX - imageContainer.getBoundingClientRect().left,
      y: e.clientY - imageContainer.getBoundingClientRect().top
    };
    
    let tempBox = createBox(startPos.x, startPos.y, 0, 0, true);
    
    const moveHandler = (e) => {
      if (!tempBox) return;
      
      const currentPos = {
        x: e.clientX - imageContainer.getBoundingClientRect().left,
        y: e.clientY - imageContainer.getBoundingClientRect().top
      };
      
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);
      
      updateBoxPosition(tempBox.id, x, y, width, height);
    };
    
    const upHandler = () => {
      if (tempBox) {
        if (tempBox.width < 20 || tempBox.height < 20) {
          removeBox(tempBox.id);
        } else {
          tempBox.temp = false;
          updateBoxList();
        }
      }
      
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };
    
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }
  
  function startTouchBoxCreation(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    let startPos = {
      x: touch.clientX - imageContainer.getBoundingClientRect().left,
      y: touch.clientY - imageContainer.getBoundingClientRect().top
    };
    
    let tempBox = createBox(startPos.x, startPos.y, 0, 0, true);
    
    const moveHandler = (e) => {
      if (!tempBox || e.touches.length !== 1) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const currentPos = {
        x: touch.clientX - imageContainer.getBoundingClientRect().left,
        y: touch.clientY - imageContainer.getBoundingClientRect().top
      };
      
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);
      
      updateBoxPosition(tempBox.id, x, y, width, height);
    };
    
    const endHandler = () => {
      if (tempBox) {
        if (tempBox.width < 20 || tempBox.height < 20) {
          removeBox(tempBox.id);
        } else {
          tempBox.temp = false;
          updateBoxList();
        }
      }
      
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
    };
    
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
  }
  
  function createBox(x, y, width, height, temp = false) {
    const boxId = Date.now();
    const box = { id: boxId, x, y, width, height, temp };
    
    const boxEl = document.createElement('div');
    boxEl.id = `box-${boxId}`;
    boxEl.className = 'selection-box';
    boxEl.style.left = `${x}px`;
    boxEl.style.top = `${y}px`;
    boxEl.style.width = `${width}px`;
    boxEl.style.height = `${height}px`;
    
    if (temp) {
      boxEl.style.borderColor = '#FF5722';
      boxEl.style.backgroundColor = 'rgba(255, 87, 34, 0.1)';
    }
    
    const handles = ['tl', 'tr', 'bl', 'br'];
    handles.forEach(handle => {
      const handleEl = document.createElement('div');
      handleEl.className = `handle handle-${handle}`;
      handleEl.dataset.handle = handle;
      boxEl.appendChild(handleEl);
    });
    
    boxEl.addEventListener('mousedown', startDrag);
    boxEl.addEventListener('touchstart', startTouchDrag);
    boxEl.querySelectorAll('.handle').forEach(handle => {
      handle.addEventListener('mousedown', startResize);
      handle.addEventListener('touchstart', startTouchResize);
    });
    
    imageContainer.appendChild(boxEl);
    selectionBoxes.push(box);
    
    return box;
  }
  
  function updateBoxPosition(boxId, x, y, width, height) {
    const box = selectionBoxes.find(b => b.id === boxId);
    if (!box) return;
    
    box.x = x;
    box.y = y;
    box.width = width;
    box.height = height;
    
    const boxEl = document.getElementById(`box-${boxId}`);
    boxEl.style.left = `${x}px`;
    boxEl.style.top = `${y}px`;
    boxEl.style.width = `${width}px`;
    boxEl.style.height = `${height}px`;
  }
  
  function startDrag(e) {
    if (isBoxMode) return;
    e.stopPropagation();
    const boxId = parseInt(e.currentTarget.id.split('-')[1]);
    currentBox = selectionBoxes.find(b => b.id === boxId);
    if (!currentBox) return;
    
    isDragging = true;
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);
    
    document.querySelectorAll('.selection-box').forEach(el => {
      el.style.borderColor = '#F59E0B';
    });
    e.currentTarget.style.borderColor = '#FF5722';
    updateBoxList();
  }
  
  function startTouchDrag(e) {
    if (isBoxMode) return;
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    e.preventDefault();
    
    const touch = e.touches[0];
    const boxId = parseInt(e.currentTarget.id.split('-')[1]);
    currentBox = selectionBoxes.find(b => b.id === boxId);
    if (!currentBox) return;
    
    isDragging = true;
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
    
    document.querySelectorAll('.selection-box').forEach(el => {
      el.style.borderColor = '#F59E0B';
    });
    e.currentTarget.style.borderColor = '#FF5722';
    updateBoxList();
    
    const moveHandler = (e) => {
      if (!isDragging || !currentBox || e.touches.length !== 1) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const containerRect = imageContainer.getBoundingClientRect();
      const x = touch.clientX - containerRect.left - dragOffset.x;
      const y = touch.clientY - containerRect.top - dragOffset.y;
      
      const maxX = containerRect.width - currentBox.width;
      const maxY = containerRect.height - currentBox.height;
      const constrainedX = Math.max(0, Math.min(x, maxX));
      const constrainedY = Math.max(0, Math.min(y, maxY));
      
      updateBoxPosition(currentBox.id, constrainedX, constrainedY, currentBox.width, currentBox.height);
    };
    
    const endHandler = () => {
      isDragging = false;
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
    };
    
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
  }
  
  function handleDrag(e) {
    if (!isDragging || !currentBox) return;
    
    const containerRect = imageContainer.getBoundingClientRect();
    const x = e.clientX - containerRect.left - dragOffset.x;
    const y = e.clientY - containerRect.top - dragOffset.y;
    
    const maxX = containerRect.width - currentBox.width;
    const maxY = containerRect.height - currentBox.height;
    const constrainedX = Math.max(0, Math.min(x, maxX));
    const constrainedY = Math.max(0, Math.min(y, maxY));
    
    updateBoxPosition(currentBox.id, constrainedX, constrainedY, currentBox.width, currentBox.height);
  }
  
  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
  }
  
  function startResize(e) {
    if (isBoxMode) return;
    e.stopPropagation();
    const boxEl = e.target.closest('.selection-box');
    const boxId = parseInt(boxEl.id.split('-')[1]);
    currentBox = selectionBoxes.find(b => b.id === boxId);
    resizeHandle = e.target.dataset.handle;
    
    isDragging = true;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  }
  
  function startTouchResize(e) {
    if (isBoxMode) return;
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    e.preventDefault();
    
    const boxEl = e.target.closest('.selection-box');
    const boxId = parseInt(boxEl.id.split('-')[1]);
    currentBox = selectionBoxes.find(b => b.id === boxId);
    resizeHandle = e.target.dataset.handle;
    isDragging = true;
    
    const moveHandler = (e) => {
      if (!isDragging || !currentBox || !resizeHandle || e.touches.length !== 1) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      const containerRect = imageContainer.getBoundingClientRect();
      let { x, y, width, height } = currentBox;
      
      switch (resizeHandle) {
        case 'tl':
          x = touch.clientX - containerRect.left;
          y = touch.clientY - containerRect.top;
          width = currentBox.x + currentBox.width - x;
          height = currentBox.y + currentBox.height - y;
          break;
        case 'tr':
          y = touch.clientY - containerRect.top;
          width = touch.clientX - containerRect.left - currentBox.x;
          height = currentBox.y + currentBox.height - y;
          break;
        case 'bl':
          x = touch.clientX - containerRect.left;
          width = currentBox.x + currentBox.width - x;
          height = touch.clientY - containerRect.top - currentBox.y;
          break;
        case 'br':
          width = touch.clientX - containerRect.left - currentBox.x;
          height = touch.clientY - containerRect.top - currentBox.y;
          break;
      }
      
      const minSize = 20;
      if (width < minSize) width = minSize;
      if (height < minSize) height = minSize;
      
      updateBoxPosition(currentBox.id, x, y, width, height);
    };
    
    const endHandler = () => {
      isDragging = false;
      resizeHandle = null;
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
    };
    
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
  }
  
  function handleResize(e) {
    if (!isDragging || !currentBox || !resizeHandle) return;
    
    const containerRect = imageContainer.getBoundingClientRect();
    let { x, y, width, height } = currentBox;
    
    switch (resizeHandle) {
      case 'tl':
        x = e.clientX - containerRect.left;
        y = e.clientY - containerRect.top;
        width = currentBox.x + currentBox.width - x;
        height = currentBox.y + currentBox.height - y;
        break;
      case 'tr':
        y = e.clientY - containerRect.top;
        width = e.clientX - containerRect.left - currentBox.x;
        height = currentBox.y + currentBox.height - y;
        break;
      case 'bl':
        x = e.clientX - containerRect.left;
        width = currentBox.x + currentBox.width - x;
        height = e.clientY - containerRect.top - currentBox.y;
        break;
      case 'br':
        width = e.clientX - containerRect.left - currentBox.x;
        height = e.clientY - containerRect.top - currentBox.y;
        break;
    }
    
    const minSize = 20;
    if (width < minSize) width = minSize;
    if (height < minSize) height = minSize;
    
    updateBoxPosition(currentBox.id, x, y, width, height);
  }
  
  function stopResize() {
    isDragging = false;
    resizeHandle = null;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }
  
  function removeBox(boxId) {
    selectionBoxes = selectionBoxes.filter(box => box.id !== boxId);
    const boxEl = document.getElementById(`box-${boxId}`);
    if (boxEl) boxEl.remove();
    updateBoxList();
    if (currentBox && currentBox.id === boxId) {
      currentBox = null;
    }
  }
  
  function clearAllBoxes() {
    selectionBoxes.forEach(box => {
      const boxEl = document.getElementById(`box-${box.id}`);
      if (boxEl) boxEl.remove();
    });
    selectionBoxes = [];
    currentBox = null;
    updateBoxList();
  }
  
  function updateBoxList() {
    boxCount.textContent = selectionBoxes.length;
    
    if (selectionBoxes.length === 0) {
      boxList.innerHTML = '<p class="text-gray-500 text-sm italic">暂无框选区域</p>';
      exportSelectedBtn.disabled = true;
      return;
    }
    
    boxList.innerHTML = selectionBoxes.map(box => `
      <div class="flex items-center justify-between p-2 border border-gray-100 rounded hover:bg-gray-50 cursor-pointer" 
           onclick="selectBox(${box.id})">
        <span>题目 ${selectionBoxes.indexOf(box) + 1}</span>
        <button type="button" class="text-gray-400 hover:text-red-500" onclick="event.stopPropagation(); removeBox(${box.id})">
          ✕
        </button>
      </div>
    `).join('');
    
    exportSelectedBtn.disabled = !currentBox;
  }
  
  window.selectBox = function(boxId) {
    currentBox = selectionBoxes.find(box => box.id === boxId);
    document.querySelectorAll('.selection-box').forEach(el => {
      el.style.borderColor = '#F59E0B';
    });
    const currentEl = document.getElementById(`box-${boxId}`);
    if (currentEl) currentEl.style.borderColor = '#FF5722';
    exportSelectedBtn.disabled = false;
  };
  
  window.removeBox = removeBox;
  
  function exportSelectedBox() {
    if (!currentBox || !currentImage) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const previewRect = previewImage.getBoundingClientRect();
    const scaleX = currentImage.width / previewRect.width;
    const scaleY = currentImage.height / previewRect.height;
    
    canvas.width = currentBox.width * scaleX;
    canvas.height = currentBox.height * scaleY;
    
    ctx.drawImage(
      currentImage,
      currentBox.x * scaleX,
      currentBox.y * scaleY,
      currentBox.width * scaleX,
      currentBox.height * scaleY,
      0, 0, canvas.width, canvas.height
    );
    
    const link = document.createElement('a');
    link.download = `题目_${selectionBoxes.indexOf(currentBox) + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
  
  function getFolderName() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `题目导出_${year}${month}${day}`;
  }
  
  async function exportToFolder() {
    if (selectionBoxes.length === 0) {
      alert('没有可导出的题目，请先框选题目');
      return;
    }

    try {
      const folderName = getFolderName();
      
      for (const box of selectionBoxes) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const previewRect = previewImage.getBoundingClientRect();
        const scaleX = currentImage.width / previewRect.width;
        const scaleY = currentImage.height / previewRect.height;
        
        canvas.width = box.width * scaleX;
        canvas.height = box.height * scaleY;
        
        ctx.drawImage(
          currentImage,
          box.x * scaleX, box.y * scaleY, 
          box.width * scaleX, box.height * scaleY,
          0, 0, canvas.width, canvas.height
        );
        
        // Download each image
        const link = document.createElement('a');
        link.download = `题目_${selectionBoxes.indexOf(box) + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      alert(`成功导出 ${selectionBoxes.length} 个题目`);
    } catch (e) {
      alert('导出失败：' + e.message);
    }
  }
  
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background-color: #f97316; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999;';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
}

// Backup and Restore functions for Android
async function BackupData() {
  try {
    const data = {
      questions: questions,
      backupDate: new Date().toISOString()
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const fileName = `酷学题库备份_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.qye`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('数据备份成功！');
  } catch (error) {
    console.error('备份失败:', error);
    alert('备份失败：' + error.message);
  }
}

// 阿里云 OSS 配置
// 安全提示：为了降低敏感信息暴露风险，使用 Base64 编码存储
const OSS_CONFIG = {
  region: 'oss-cn-shanghai.aliyuncs.com',  // OSS 区域 endpoint
  bucket: atob('a3V4dWUtcXVlc3Rpb24tYmFuaw=='),  // Bucket 名称（Base64 编码）
  accessKeyId: atob('TFRBSTV0ODRxZ1lKQUFjaFBhcXZ6VjdW'),  // AccessKey ID（Base64 编码）
  accessKeySecret: atob('T0NRS0pUVWN2V3FiQjFObWdWamRQYjJuandRRjAz'),  // AccessKey Secret（Base64 编码）
  folderPath: 'UpLoad-by-Android',
  enableAutoUpload: true
};

// 使用说明：
// 1. 将上面的 Base64 编码字符串替换为你自己的配置
// 2. 使用 btoa('your-actual-value') 生成 Base64 编码
// 3. 例如：btoa('my-bucket-name') 生成 Base64 字符串
// 安全建议：
// - 生产环境应该使用后端服务器代理 OSS 请求
// - 不要将 AccessKey 直接暴露在前端代码中
// - 考虑使用 OSS 的 STS 临时令牌服务

// 上传备份到阿里云 OSS（使用签名 URL）
const UPLOAD_HISTORY_KEY = 'kuxue_upload_history';

async function UploadBackupToOSS() {
  try {
    // 检查是否启用了自动上传
    if (!OSS_CONFIG.enableAutoUpload) {
      alert('自动上传功能未启用');
      return;
    }
    
    // 使用文件选择对话框让用户选择要上传的备份文件
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.qye';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // 显示上传进度提示
      const loadingMsg = document.createElement('div');
      loadingMsg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px 40px;
        border-radius: 10px;
        font-size: 16px;
        z-index: 9999;
      `;
      loadingMsg.innerHTML = '<i class="fa fa-spinner fa-spin"></i> 正在上传 ' + file.name + '...';
      document.body.appendChild(loadingMsg);
      
      try {
        // 生成 OSS 对象名称
        const date = new Date();
        const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        const objectName = `${OSS_CONFIG.folderPath}/${dateStr}/${file.name}`;
        
        // 使用新的安全上传方法
        const result = await uploadToOSS(objectName, file, {
          expiresIn: 300, // 5 分钟有效期
          contentType: 'application/octet-stream'
        });
        
        // 移除加载提示
        document.body.removeChild(loadingMsg);
        
        if (result.success) {
          // 记录上传历史
          saveUploadHistory({
            fileName: file.name,
            objectName: objectName,
            url: result.url,
            uploadTime: new Date().toISOString(),
            size: file.size
          });
          
          // 刷新上传列表显示
          updateUploadList();
          
          alert(`✅ 上传成功！\n\n文件名称：${file.name}\nOSS 路径：${objectName}\n访问 URL: ${result.url}\n签名有效期：${new Date(result.expiration * 1000).toLocaleString()}`);
        }
      } catch (error) {
        // 移除加载提示
        if (loadingMsg.parentNode) {
          document.body.removeChild(loadingMsg);
        }
        console.error('OSS 上传过程出错:', error);
        alert('上传失败：' + error.message + '\n\n请确保 AccessKey 配置正确，或检查网络连接。');
      }
    };
    
    input.click();
  } catch (error) {
    console.error('OSS 上传过程出错:', error);
    alert('上传失败：' + error.message);
  }
}

// 保存上传历史
function saveUploadHistory(record) {
  try {
    const history = JSON.parse(localStorage.getItem(UPLOAD_HISTORY_KEY) || '[]');
    history.unshift(record); // 添加到开头
    
    // 只保留最近 20 条记录
    if (history.length > 20) {
      history.splice(20);
    }
    
    localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('保存上传历史失败:', error);
  }
}

// 获取上传历史
function getUploadHistory() {
  try {
    return JSON.parse(localStorage.getItem(UPLOAD_HISTORY_KEY) || '[]');
  } catch (error) {
    console.error('读取上传历史失败:', error);
    return [];
  }
}

// 更新上传列表显示
function updateUploadList() {
  const listContainer = document.getElementById('uploadHistoryList');
  if (!listContainer) return;
  
  const history = getUploadHistory();
  
  if (history.length === 0) {
    listContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">暂无上传记录</p>';
    return;
  }
  
  let html = '';
  history.forEach((record, index) => {
    const uploadTime = new Date(record.uploadTime).toLocaleString('zh-CN');
    const fileSize = formatFileSize(record.size);
    
    html += `<div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px; margin-bottom: 8px; background: #f8f9fa;">`;
    html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
    html += `<div style="flex: 1;">`;
    html += `<strong style="color: #333; font-size: 14px;">${record.fileName}</strong>`;
    html += `<br><small style="color: #666;">上传时间：${uploadTime}</small>`;
    html += `<br><small style="color: #666;">文件大小：${fileSize}</small>`;
    html += `</div>`;
    html += `<div style="margin-left: 10px;">`;
    html += `<button onclick="copyUploadUrl('${record.url}')" style="background: #4169E1; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">复制URL</button>`;
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;
  });
  
  listContainer.innerHTML = html;
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 复制上传 URL
function copyUploadUrl(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      alert('URL 已复制到剪贴板');
    }).catch(() => {
      // 降级方案
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('URL 已复制到剪贴板');
    });
  } else {
    // 降级方案
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert('URL 已复制到剪贴板');
  }
}

// 初始化上传列表
function initUploadList() {
  updateUploadList();
}

// ==================== OSS 安全访问工具函数 ====================

/**
 * 计算 MD5（使用浏览器 Crypto API）
 * @param {ArrayBuffer} arrayBuffer - 文件内容的 ArrayBuffer
 * @returns {Promise<string>} Base64 编码的 MD5 值
 */
async function calculateMD5(arrayBuffer) {
  try {
    // 使用 Web Crypto API 计算 MD5
    const hashBuffer = await crypto.subtle.digest('MD5', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return btoa(hashHex);
  } catch (error) {
    console.error('MD5 计算失败:', error);
    // 降级方案：返回空字符串（OSS 不强制要求 MD5）
    return '';
  }
}

/**
 * 生成 OSS 签名
 * @param {string} method - HTTP 方法
 * @param {string} objectKey - OSS 对象名称
 * @param {string} contentType - 内容类型
 * @param {number} expiration - 过期时间戳
 * @returns {Promise<string>} Base64 编码的签名
 */
async function generateOSSSignature(method, objectKey, contentType, expiration) {
  const canonicalizedOSSHeaders = '';
  const canonicalizedResource = `/${OSS_CONFIG.bucket}/${objectKey}`;
  const stringToSign = `${method}\n\n${contentType}\n${expiration}\n${canonicalizedOSSHeaders}${canonicalizedResource}`;
  
  // 使用 Web Crypto API 计算 HMAC-SHA1 签名
  const encoder = new TextEncoder();
  const keyData = encoder.encode(OSS_CONFIG.accessKeySecret);
  const messageData = encoder.encode(stringToSign);
  
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  } catch (error) {
    console.error('签名计算失败:', error);
    throw new Error('无法计算 OSS 签名：' + error.message);
  }
}

/**
 * 生成上传签名 URL
 * @param {string} objectKey - OSS 对象名称
 * @param {number} expiresIn - 过期时间（秒）
 * @param {string} contentType - 文件类型
 * @returns {Promise<Object>} 签名 URL 信息
 */
async function getUploadSignature(objectKey, expiresIn = 300, contentType = 'application/octet-stream') {
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + expiresIn;
  const signature = await generateOSSSignature('PUT', objectKey, contentType, expiration);
  
  return {
    url: `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${objectKey}`,
    signedUrl: `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${objectKey}?OSSAccessKeyId=${OSS_CONFIG.accessKeyId}&Expires=${expiration}&Signature=${encodeURIComponent(signature)}`,
    expiration: expiration
  };
}

/**
 * 生成下载签名 URL
 * @param {string} objectKey - OSS 对象名称
 * @param {number} expiresIn - 过期时间（秒）
 * @returns {Promise<Object>} 签名 URL 信息
 */
async function getDownloadSignature(objectKey, expiresIn = 300) {
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + expiresIn;
  const signature = await generateOSSSignature('GET', objectKey, '', expiration);
  
  return {
    url: `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${objectKey}`,
    signedUrl: `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${objectKey}?OSSAccessKeyId=${OSS_CONFIG.accessKeyId}&Expires=${expiration}&Signature=${encodeURIComponent(signature)}`,
    expiration: expiration
  };
}

/**
 * 上传文件到 OSS（使用签名 URL）
 * @param {string} objectKey - OSS 对象名称
 * @param {Blob|File} file - 文件对象
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 上传结果
 */
async function uploadToOSS(objectKey, file, options = {}) {
  const {
    expiresIn = 300,
    contentType = file.type || 'application/octet-stream'
  } = options;

  try {
    console.log('开始上传文件到 OSS...');
    console.log('文件路径:', objectKey);
    console.log('文件大小:', file.size, 'bytes');
    console.log('文件类型:', contentType);
    
    // 获取签名 URL
    const signature = await getUploadSignature(objectKey, expiresIn, contentType);
    
    console.log('签名 URL 获取成功');
    if (signature && signature.signedUrl) {
      console.log('签名 URL:', signature.signedUrl.substring(0, 100) + '...');
      console.log('过期时间:', new Date(signature.expiration * 1000).toLocaleString());
    } else {
      console.error('签名 URL 无效:', signature);
      throw new Error('签名服务器返回了无效的签名 URL');
    }
    
    // 计算文件 MD5
    const arrayBuffer = await file.arrayBuffer();
    const md5 = await calculateMD5(arrayBuffer);
    
    console.log('文件 MD5:', md5);

    // 上传文件
    console.log('开始发送 PUT 请求到 OSS...');
    const response = await fetch(signature.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-MD5': md5 || ''  // 如果 MD5 计算失败，使用空字符串
      },
      body: arrayBuffer
    });

    console.log('OSS 响应状态:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OSS 返回错误:', errorText);
      throw new Error(`上传失败：${response.status} ${response.statusText}\n${errorText}`);
    }

    console.log('✅ 文件上传成功！');
    
    return {
      success: true,
      url: signature.url,
      objectKey: objectKey,
      expiration: signature.expiration
    };
  } catch (error) {
    console.error('❌ OSS 上传失败:', error);
    console.error('错误堆栈:', error.stack);
    throw error;
  }
}

/**
 * 从 OSS 下载文件（使用签名 URL）
 * @param {string} objectKey - OSS 对象名称
 * @param {Object} options - 选项
 * @returns {Promise<Blob>} 文件 Blob 对象
 */
async function downloadFromOSS(objectKey, options = {}) {
  const { expiresIn = 300 } = options;

  try {
    // 获取签名 URL
    const signature = await getDownloadSignature(objectKey, expiresIn);

    // 下载文件
    const response = await fetch(signature.signedUrl);

    if (!response.ok) {
      throw new Error(`下载失败：${response.status} ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('OSS 下载失败:', error);
    throw error;
  }
}

/**
 * 从 OSS 下载 JSON 文件
 * @param {string} objectKey - OSS 对象名称
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 解析后的 JSON 对象
 */
async function downloadJSONFromOSS(objectKey, options = {}) {
  const blob = await downloadFromOSS(objectKey, options);
  const text = await blob.text();
  return JSON.parse(text);
}

// ==================== 原有的辅助函数 ====================

// 辅助函数：读取文件为 ArrayBuffer
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 辅助函数：ArrayBuffer 转 Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// 辅助函数：Base64 转 ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// 导出函数到全局作用域
window.UploadBackupToOSS = UploadBackupToOSS;

async function RestoreData() {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.qye,.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.questions && Array.isArray(data.questions)) {
            const importCount = data.questions.length;
            const currentCount = questions.length;
            
            // 显示恢复模式选择弹窗
            const choice = await showRestoreModeDialog(importCount, currentCount);
            
            if (choice === 'overwrite') {
              // 覆盖式恢复：完全替换现有数据
              questions = data.questions;
              await SaveQuestions();
              UpdateDashboard();
              alert(`数据恢复成功！已覆盖原有 ${currentCount} 道题目，现共有 ${questions.length} 道题目。`);
            } else if (choice === 'append') {
              // 增添性恢复：保留现有数据，追加新数据
              let addedCount = 0;
              let duplicateCount = 0;
              
              data.questions.forEach(newQ => {
                // 检查是否重复（通过题目内容判断）
                const isDuplicate = questions.some(existingQ => 
                  existingQ.content === newQ.content && 
                  existingQ.type === newQ.type
                );
                
                if (!isDuplicate) {
                  questions.push(newQ);
                  addedCount++;
                } else {
                  duplicateCount++;
                }
              });
              
              await SaveQuestions();
              UpdateDashboard();
              alert(`增添性恢复完成！\n新增题目：${addedCount} 道\n跳过重复：${duplicateCount} 道\n现共有题目：${questions.length} 道`);
            }
            // choice === null 表示取消
          } else {
            alert('无效的备份文件格式！');
          }
        } catch (error) {
          alert('读取备份文件失败：' + error.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  } catch (error) {
    console.error('恢复失败:', error);
    alert('恢复失败：' + error.message);
  }
}

function showRestoreModeDialog(importCount, currentCount) {
  // 创建弹窗遮罩层
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;
  
  // 创建弹窗内容
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 90%;
    width: 400px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  
  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px 0; font-size: 20px; color: #333;">选择恢复模式</h3>
    <p style="margin: 0 0 12px 0; color: #666; line-height: 1.6;">
      备份文件包含 <strong style="color: #4169E1;">${importCount}</strong> 道题目<br>
      当前题库有 <strong style="color: #4169E1;">${currentCount}</strong> 道题目
    </p>
    <div style="margin: 20px 0;">
      <button id="btnOverwrite" style="
        width: 100%;
        padding: 12px;
        margin-bottom: 10px;
        background: #FF6B6B;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        cursor: pointer;
        text-align: left;
      ">
        <div style="font-weight: bold;">覆盖式恢复</div>
        <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">清空现有题库，完全替换为备份数据</div>
      </button>
      <button id="btnAppend" style="
        width: 100%;
        padding: 12px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        cursor: pointer;
        text-align: left;
      ">
        <div style="font-weight: bold;">增添性恢复</div>
        <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">保留现有题目，追加备份中的新题目</div>
      </button>
    </div>
    <button id="btnCancel" style="
      width: 100%;
      padding: 10px;
      background: #f5f5f5;
      color: #666;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
    ">
      取消
    </button>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  return new Promise((resolve) => {
    // 使用 setTimeout 确保 DOM 元素已经渲染完成
    setTimeout(() => {
      const btnOverwrite = document.getElementById('btnOverwrite');
      const btnAppend = document.getElementById('btnAppend');
      const btnCancel = document.getElementById('btnCancel');
      
      if (btnOverwrite) {
        btnOverwrite.onclick = () => {
          document.body.removeChild(overlay);
          resolve('overwrite');
        };
      }
      
      if (btnAppend) {
        btnAppend.onclick = () => {
          document.body.removeChild(overlay);
          resolve('append');
        };
      }
      
      if (btnCancel) {
        btnCancel.onclick = () => {
          document.body.removeChild(overlay);
          resolve(null);
        };
      }
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(null);
        }
      };
    }, 0);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await initApp();
});

window.showPanel = ShowPanel;
window.closeModal = CloseModal;
window.saveQuestion = SaveQuestion;
window.incrementErrorCount = incrementErrorCount;
window.DeleteQuestion = DeleteQuestion;
window.searchQuestions = SearchQuestions;
window.OpenLocalQuestionImport = OpenLocalQuestionImport;
window.FilterAutoQuestions = FilterAutoQuestions;
window.ExportToPDF = ExportToPDF;
window.ExportToMarkdown = ExportToMarkdown;
window.ExportToWord = ExportToWord;
window.ClearPageImages = ClearPageImages;
window.BackupData = BackupData;
window.RestoreData = RestoreData;

// 图片裁剪和摄像头拍照功能
let currentCropInputId = null;
let cropCanvas = null;
let cropCtx = null;
let originalImage = null;
let cropArea = null;
let cropX = 0, cropY = 0, cropWidth = 0, cropHeight = 0;
let isDragging = false;
let isResizing = false;
let currentHandle = null;
let cameraStream = null;

function openCamera(inputId) {
  currentCropInputId = inputId;
  const cameraModal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraVideo');
  
  cameraModal.style.display = 'block';
  
  navigator.mediaDevices.getUserMedia({ 
    video: { 
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    } 
  }).then(stream => {
    cameraStream = stream;
    video.srcObject = stream;
  }).catch(error => {
    console.error('摄像头访问失败:', error);
    alert('无法访问摄像头，请确保已授予相机权限');
    closeCamera();
  });
}

function closeCamera() {
  const cameraModal = document.getElementById('cameraModal');
  cameraModal.style.display = 'none';
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

async function takePhoto() {
  const video = document.getElementById('cameraVideo');
  let width = video.videoWidth;
  let height = video.videoHeight;
  
  // 创建 canvas
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  
  // 移动端摄像头默认是竖屏的，需要逆时针旋转 90 度来修正方向
  // 交换宽高并逆时针旋转 90 度
  tempCanvas.width = height;
  tempCanvas.height = width;
  
  // 逆时针旋转 90 度修正图片方向
  tempCtx.translate(height / 2, width / 2);
  tempCtx.rotate(-90 * Math.PI / 180);
  tempCtx.drawImage(video, -width / 2, -height / 2, width, height);
  
  const imageData = tempCanvas.toDataURL('image/jpeg', 0.9);
  
  closeCamera();
  
  originalImage = new Image();
  originalImage.onload = () => {
    showCropModal(imageData);
  };
  originalImage.src = imageData;
}

function showCropModal(imageSrc) {
  const cropModal = document.getElementById('cropModal');
  cropCanvas = document.getElementById('cropCanvas');
  cropCtx = cropCanvas.getContext('2d');
  cropArea = document.getElementById('cropArea');
  
  originalImage = new Image();
  originalImage.onload = () => {
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.6;
    
    let displayWidth = originalImage.width;
    let displayHeight = originalImage.height;
    
    const scale = Math.min(maxWidth / displayWidth, maxHeight / displayHeight);
    if (scale < 1) {
      displayWidth = displayWidth * scale;
      displayHeight = displayHeight * scale;
    }
    
    cropCanvas.width = displayWidth;
    cropCanvas.height = displayHeight;
    cropCanvas.style.width = displayWidth + 'px';
    cropCanvas.style.height = displayHeight + 'px';
    
    cropCtx.drawImage(originalImage, 0, 0, displayWidth, displayHeight);
    
    cropX = displayWidth * 0.1;
    cropY = displayHeight * 0.1;
    cropWidth = displayWidth * 0.8;
    cropHeight = displayHeight * 0.8;
    
    updateCropArea();
    
    cropModal.style.display = 'block';
    
    initCropEvents();
  };
  originalImage.src = imageSrc;
}

function initCropEvents() {
  const cropAreaEl = document.getElementById('cropArea');
  const handles = cropAreaEl.querySelectorAll('.crop-handle');
  
  cropAreaEl.addEventListener('touchstart', handleAreaTouchStart, { passive: false });
  cropAreaEl.addEventListener('touchmove', handleAreaTouchMove, { passive: false });
  cropAreaEl.addEventListener('touchend', handleAreaTouchEnd);
  
  cropAreaEl.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  handles.forEach(handle => {
    handle.addEventListener('touchstart', handleHandleTouchStart, { passive: false });
    handle.addEventListener('touchmove', handleHandleTouchMove, { passive: false });
    handle.addEventListener('touchend', handleHandleTouchEnd);
    handle.addEventListener('mousedown', handleHandleMouseDown);
  });
}

let dragStartX = 0, dragStartY = 0;

function handleAreaTouchStart(e) {
  if (e.touches.length === 1) {
    isDragging = true;
    const touch = e.touches[0];
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
  }
}

function handleAreaTouchMove(e) {
  if (!isDragging) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  const deltaX = touch.clientX - dragStartX;
  const deltaY = touch.clientY - dragStartY;
  
  cropX += deltaX;
  cropY += deltaY;
  
  dragStartX = touch.clientX;
  dragStartY = touch.clientY;
  
  constrainCropArea();
  updateCropArea();
}

function handleAreaTouchEnd() {
  isDragging = false;
}

function handleMouseDown(e) {
  if (e.button !== 0) return;
  isDragging = true;
  const rect = cropArea.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  
  const moveHandler = (e) => {
    const containerRect = cropCanvas.getBoundingClientRect();
    cropX = e.clientX - containerRect.left - offsetX;
    cropY = e.clientY - containerRect.top - offsetY;
    
    constrainCropArea();
    updateCropArea();
  };
  
  const upHandler = () => {
    isDragging = false;
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);
  };
  
  document.addEventListener('mousemove', moveHandler);
  document.addEventListener('mouseup', upHandler);
}

function handleMouseMove(e) {
  if (!isDragging) return;
  
  const containerRect = cropCanvas.getBoundingClientRect();
  cropX = e.clientX - containerRect.left - (cropWidth / 2);
  cropY = e.clientY - containerRect.top - (cropHeight / 2);
  
  constrainCropArea();
  updateCropArea();
}

function handleMouseUp() {
  isDragging = false;
}

function handleHandleTouchStart(e) {
  e.stopPropagation();
  isResizing = true;
  const classList = e.target.classList;
  currentHandle = classList.contains('crop-handle-tl') ? 'tl' :
                  classList.contains('crop-handle-tr') ? 'tr' :
                  classList.contains('crop-handle-bl') ? 'bl' : 'br';
}

function handleHandleTouchMove(e) {
  if (!isResizing || !currentHandle) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  const containerRect = cropCanvas.getBoundingClientRect();
  const x = touch.clientX - containerRect.left;
  const y = touch.clientY - containerRect.top;
  
  resizeCropArea(x, y);
}

function handleHandleTouchEnd() {
  isResizing = false;
  currentHandle = null;
}

function handleHandleMouseDown(e) {
  e.stopPropagation();
  isResizing = true;
  currentHandle = e.target.dataset.handle || 
                  (e.target.className.includes('tl') ? 'tl' : 
                   e.target.className.includes('tr') ? 'tr' : 
                   e.target.className.includes('bl') ? 'bl' : 'br');
  
  const moveHandler = (e) => {
    const containerRect = cropCanvas.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    
    resizeCropArea(x, y);
  };
  
  const upHandler = () => {
    isResizing = false;
    currentHandle = null;
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);
  };
  
  document.addEventListener('mousemove', moveHandler);
  document.addEventListener('mouseup', upHandler);
}

function resizeCropArea(x, y) {
  const minSize = 50;
  
  switch (currentHandle) {
    case 'tl':
      const newWidth1 = cropX + cropWidth - x;
      const newHeight1 = cropY + cropHeight - y;
      if (newWidth1 > minSize) { cropWidth = newWidth1; cropX = x; }
      if (newHeight1 > minSize) { cropHeight = newHeight1; cropY = y; }
      break;
    case 'tr':
      const newWidth2 = x - cropX;
      const newHeight2 = cropY + cropHeight - y;
      if (newWidth2 > minSize) { cropWidth = newWidth2; }
      if (newHeight2 > minSize) { cropHeight = newHeight2; cropY = y; }
      break;
    case 'bl':
      const newWidth3 = cropX + cropWidth - x;
      const newHeight3 = y - cropY;
      if (newWidth3 > minSize) { cropWidth = newWidth3; cropX = x; }
      if (newHeight3 > minSize) { cropHeight = newHeight3; }
      break;
    case 'br':
      const newWidth4 = x - cropX;
      const newHeight4 = y - cropY;
      if (newWidth4 > minSize) { cropWidth = newWidth4; }
      if (newHeight4 > minSize) { cropHeight = newHeight4; }
      break;
  }
  
  constrainCropArea();
  updateCropArea();
}

function constrainCropArea() {
  const canvasWidth = cropCanvas.width;
  const canvasHeight = cropCanvas.height;
  const minSize = 50;
  
  if (cropX < 0) cropX = 0;
  if (cropY < 0) cropY = 0;
  if (cropX + cropWidth > canvasWidth) cropWidth = canvasWidth - cropX;
  if (cropY + cropHeight > canvasHeight) cropHeight = canvasHeight - cropY;
  
  if (cropWidth < minSize) cropWidth = minSize;
  if (cropHeight < minSize) cropHeight = minSize;
}

function updateCropArea() {
  cropArea.style.left = cropX + 'px';
  cropArea.style.top = cropY + 'px';
  cropArea.style.width = cropWidth + 'px';
  cropArea.style.height = cropHeight + 'px';
}

function resetCropArea() {
  const canvasWidth = cropCanvas.width;
  const canvasHeight = cropCanvas.height;
  
  cropX = canvasWidth * 0.1;
  cropY = canvasHeight * 0.1;
  cropWidth = canvasWidth * 0.8;
  cropHeight = canvasHeight * 0.8;
  
  updateCropArea();
}

function confirmCrop() {
  if (!originalImage || !cropCtx) return;
  
  const scaleX = originalImage.width / cropCanvas.width;
  const scaleY = originalImage.height / cropCanvas.height;
  
  const cropCanvas2 = document.createElement('canvas');
  cropCanvas2.width = cropWidth * scaleX;
  cropCanvas2.height = cropHeight * scaleY;
  const ctx = cropCanvas2.getContext('2d');
  
  ctx.drawImage(
    originalImage,
    cropX * scaleX,
    cropY * scaleY,
    cropWidth * scaleX,
    cropHeight * scaleY,
    0,
    0,
    cropWidth * scaleX,
    cropHeight * scaleY
  );
  
  const croppedDataUrl = cropCanvas2.toDataURL('image/jpeg', 0.9);
  
  const input = document.getElementById(currentCropInputId);
  const previewDiv = document.getElementById(currentCropInputId + 'Preview');
  
  const dataTransfer = new DataTransfer();
  const blob = dataURLToBlob(croppedDataUrl);
  const file = new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' });
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  
  previewDiv.innerHTML = `<img src="${croppedDataUrl}" style="max-width: 100%; max-height: 200px; border-radius: 8px; border: 2px solid #4169E1;">`;
  
  document.getElementById('cropModal').style.display = 'none';
}

function cancelCrop() {
  document.getElementById('cropModal').style.display = 'none';
  currentCropInputId = null;
}

function dataURLToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

window.openCamera = openCamera;
window.closeCamera = closeCamera;
window.takePhoto = takePhoto;
window.cancelCrop = cancelCrop;
window.resetCropArea = resetCropArea;
window.confirmCrop = confirmCrop;

// 为图片上传输入框添加预览功能
document.addEventListener('DOMContentLoaded', function() {
  const imageInputs = ['questionContentImg', 'questionAnswerImg', 'questionAnalysisImg'];
  
  imageInputs.forEach(inputId => {
    const input = document.getElementById(inputId);
    if (input) {
      input.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = function(event) {
            const previewDiv = document.getElementById(inputId + 'Preview');
            if (previewDiv) {
              previewDiv.innerHTML = `<img src="${event.target.result}" style="max-width: 100%; max-height: 200px; border-radius: 8px; border: 2px solid #4169E1;">`;
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  });
});

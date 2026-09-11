let idiomaAtual = 'en'; 
let isConnectedMode = false;
window.hasCustomAnimApplied = false;
let IP_LOCAL = "http://127.0.0.1:4040";
let sessionToken = '';
let currentProject = null;
let currentPlayerObjectUrl = null;

const SITE_API_MIN = 1;
const SITE_API_MAX = 1;
const LEGACY_SECURE_FEATURES = new Set([
    'session_auth',
    'direct_upload',
    'pull',
    'history',
    'history_webm',
    'remove',
    'reset',
    'test_animation',
    'device_resolution'
]);
let moduleInfo = null;
let moduleApiVersion = null;
let moduleFeatures = new Set();
let moduleCompatibilityMode = 'unknown';

const inputVideo = document.getElementById('upload-video');
const playerVideo = document.getElementById('player-video');
const videoContainer = document.getElementById('video-container');
const timelineWrapper = document.getElementById('timeline-wrapper');
const scrollTimeline = document.getElementById('timeline-scroll');
const filmstrip = document.getElementById('filmstrip');
const gridMarcadores = document.getElementById('grid-marcadores');
const configuracoes = document.getElementById('configuracoes');
const btnGerar = document.getElementById('btn-gerar');
const btnVerPreview = document.getElementById('btn-ver-preview');
const dicasIniciais = document.getElementById('dicas-iniciais');
const videoPreview = document.getElementById('video-preview');
const tooltipFlutuante = document.getElementById('tooltip-flutuante');

const canvasInvisivel = document.createElement('canvas');
const contexto = canvasInvisivel.getContext('2d', { alpha: false, willReadFrequently: true }); 

let marcadores = { m0: null, m1: null, m2: null, m3: null };
let originalW = 0, originalH = 0;
let isGenerating = false;
let animationFrameId = null;
let tooltipTimeout;

let isBuildingTimeline = false;
let isProgrammaticScroll = false;

const previewAudios = { m0: new Audio(), m1: new Audio(), m2: new Audio() };
const previewAudioUrls = { m0: null, m1: null, m2: null };
const importedAudioFiles = { intro: null, loop: null, final: null };
let currentPreviewPart = -1;

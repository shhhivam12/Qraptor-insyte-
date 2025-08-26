// Global variables
let currentCampaignId = null;
let currentInfluencers = [];

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Defensive: remove any stale loading overlay that may block inputs
    try { hideLoading(); } catch(_) {}
    initializeApp();
    initializeParallax();
    initializeInteractiveElements();
    initializeScrollAnimations();
});

// Ensure overlays are cleared after full window load as well
window.addEventListener('load', () => { try { hideLoading(); } catch(_) {} });

function initializeApp() {
    // Initialize tooltips and other UI elements
    initializeTooltips();
    
    // Add event listeners
    addEventListeners();
    
    // Check if we're on a specific page and initialize accordingly
    const currentPage = window.location.pathname;
    if (currentPage === '/campaign') {
        initializeCampaignPage();
    } else if (currentPage === '/results') {
        initializeResultsPage();
    } else if (currentPage === '/analysis') {
        initializeAnalysisPage();
    }
}

// Lightweight parallax for hero decorative elements
function initializeParallax(){
    const parallaxNodes = document.querySelectorAll('[data-depth]');
    if(!parallaxNodes.length) return;
    let rafId = null;

    const onMove = (evt)=>{
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const x = (evt.clientX || cx) - cx;
        const y = (evt.clientY || cy) - cy;
        if(rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(()=>{
            parallaxNodes.forEach(node=>{
                const depth = parseFloat(node.getAttribute('data-depth')) || 0.1;
                const tx = -(x * depth);
                const ty = -(y * depth);
                node.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
            });
        });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('deviceorientation', (e)=>{
        const beta = e.beta || 0; // x-axis tilt
        const gamma = e.gamma || 0; // y-axis tilt
        parallaxNodes.forEach(node=>{
            const depth = parseFloat(node.getAttribute('data-depth')) || 0.1;
            const tx = (gamma * depth) * 1.2;
            const ty = (beta * depth) * 0.8;
            node.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        });
    }, { passive: true });
}

function addEventListeners() {
    // Navigation
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', handleNavigation);
    });
    
    // Campaign form
    const campaignForm = document.getElementById('campaignForm');
    if (campaignForm) {
        campaignForm.addEventListener('submit', handleCampaignSubmit);
    }
    
    // Influencer search form
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handleInfluencerSearch);
    }

    // IG test form (homepage)
    const igTestForm = document.getElementById('igTestForm');
    if (igTestForm) {
        igTestForm.addEventListener('submit', handleIgTestSubmit);
    }
    
    // Dynamic form elements
    document.addEventListener('change', handleDynamicFormChanges);
}

// Campaign Management
async function handleCampaignSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const payload = {
        campaign_name: form.campaign_name.value,
        goal: form.goal.value,
        target_audience: form.target_audience.value,
        brand_name: form.brand_name.value,
        niche: form.niche.value,
        brand_website: form.brand_website.value,
        platform: form.platform.value,
        budget: form.budget.value
    };

    try {
        showLoading('Creating campaign...');
        const response = await fetch('/api/create_campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.success) {
            currentCampaignId = result.campaign_id;
            sessionStorage.setItem('currentCampaignId', currentCampaignId);
            showSuccess('Campaign created successfully!');
            setTimeout(() => { window.location.href = '/results'; }, 800);
        } else {
            showError(result.message || 'Failed to create campaign');
        }
    } catch (error) {
        console.error('Error creating campaign:', error);
        showError('An error occurred while creating the campaign');
    } finally { hideLoading(); }
}

// Influencer Search and Management
async function handleInfluencerSearch(event) {
    event.preventDefault();
    
    const campaignSelect = document.getElementById('campaignSelect');
    const selectedCampaignId = campaignSelect ? campaignSelect.value : null;
    currentCampaignId = selectedCampaignId || currentCampaignId || sessionStorage.getItem('currentCampaignId');
    if (!currentCampaignId) { showError('Please select or create a campaign first'); return; }
    if (campaignSelect && !campaignSelect.value) { showError('Please select a campaign'); return; }

    const formData = new FormData(event.target);
    const filters = {
        platform: formData.get('platform') || undefined,
        niche: formData.get('niche') || undefined,
        followers_min: formData.get('followers_min') || undefined,
        followers_max: formData.get('followers_max') || undefined,
        audience_age_range: formData.get('audience_age_range') || undefined,
        audience_gender: formData.get('audience_gender') || undefined,
        audience_location: formData.get('audience_location') || undefined
    };

    try {
        showLoadingLong('🤖 AI is analyzing influencers... This may take 40-60 seconds.');
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(), 45000);
        const response = await fetch('/api/fetch_influencers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: currentCampaignId, filters }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        const result = await response.json();
        if (result.success) {
            currentInfluencers = result.influencers;
            displayInfluencers(currentInfluencers);
            showSuccess(`Found ${result.count} influencers`);
        } else {
            showError(result.message || 'Failed to fetch influencers');
        }
    } catch (error) {
        console.error('Error fetching influencers:', error);
        if(error.name === 'AbortError'){
            showError('The request timed out. Please try again.');
        } else {
            showError(error.message || 'An error occurred while searching for influencers');
        }
    } finally { hideLoading(); }
}

function displayInfluencers(influencers) {
    const container = document.getElementById('influencerResults');
    if (!container) return;
    
    if (influencers.length === 0) {
        container.innerHTML = '<p class="text-center">No influencers found.</p>';
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'influencer-grid';
    
    influencers.forEach(influencer => {
        grid.appendChild(createInfluencerCard(influencer));
    });
    
    container.innerHTML = '';
    container.appendChild(grid);
}

function createInfluencerCard(inf) {
    const card = document.createElement('div');
    card.className = 'unified-influencer-card fade-in-up';
    
    const score = inf.brand_fit_score ?? Math.floor(Math.random()*21)+75;
    const avatarSrc = inf.avatar ? `/api/proxy_image?url=${encodeURIComponent(inf.avatar)}` : 'https://via.placeholder.com/80x80/3b82f6/ffffff?text=IN';
    
    // Create score badge with color
    const getScoreColor = (score) => {
        if (score >= 90) return '#10b981'; // green
        if (score >= 80) return '#f59e0b'; // amber
        if (score >= 70) return '#ef4444'; // red
        return '#6b7280'; // gray
    };
    
    card.innerHTML = `
        <div class="unified-card-header">
            <div class="profile-section">
                <div class="avatar-container">
                    <img src="${avatarSrc}" alt="${inf.name || inf.username || ''}" class="unified-avatar" 
                         onerror="this.src='https://via.placeholder.com/80x80/3b82f6/ffffff?text=IN'" 
                         crossorigin="anonymous">
                    <div class="platform-indicator">${inf.platform || 'Instagram'}</div>
                </div>
                <div class="profile-info">
                    <div class="profile-name">${inf.name || inf.username || ''}</div>
                    <div class="profile-username">@${inf.username || inf.channel_id || ''}</div>
                    <div class="profile-stats">
                        <span class="stat-chip"><i class="fas fa-user-group"></i> ${formatNumber(inf.followers || 0)}</span>
                        <span class="stat-chip"><i class="fas fa-users"></i> ${formatNumber(inf.following || 0)}</span>
                        <span class="stat-chip"><i class="fas fa-image"></i> ${formatNumber(inf.posts || 0)}</span>
                        <span class="stat-chip"><i class="fas fa-chart-line"></i> ${(inf.avg_engagement_rate ?? 2.5).toFixed(1)}%</span>
                    </div>
                </div>
            </div>
            <div class="score-section">
                <div class="brand-fit-score" style="background: ${getScoreColor(score)}">
                    <div class="score-value">${score}</div>
                    <div class="score-label">Brand Fit</div>
                </div>
            </div>
        </div>
        
        ${inf.summary ? `
        <div class="summary-section">
            <div class="summary-content">${inf.summary}</div>
        </div>
        ` : ''}
        
        <div class="action-section">
            <button class="action-btn view-btn" onclick="viewProfile('${inf.username || inf.channel_id || ''}', '${inf.platform || 'Instagram'}')" title="View Profile">
                <i class="fas fa-external-link-alt"></i>
            </button>
            <button class="action-btn mail-btn" onclick="contactInfluencer('${inf.id || ''}')" title="Send Mail">
                <i class="fas fa-envelope"></i>
            </button>
            <button class="action-btn add-btn" onclick="addSingleInfluencer('${inf.id || ''}')" title="Add to Campaign">
                <i class="fas fa-plus"></i>
            </button>
        </div>
    `;
    return card;
}

// Campaign Management
async function addInfluencersToCampaign() {
    const selectedInfluencers = getSelectedInfluencers();
    
    if (selectedInfluencers.length === 0) {
        showError('Please select at least one influencer');
        return;
    }
    
    try {
        showLoading('Adding influencers to campaign...');
        
        const response = await fetch('/api/add_influencers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                campaign_id: currentCampaignId,
                influencer_ids: selectedInfluencers
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(result.message);
            // Update UI to show selected influencers
            updateSelectedInfluencersUI(selectedInfluencers);
        } else {
            showError(result.message || 'Failed to add influencers');
        }
    } catch (error) {
        console.error('Error adding influencers:', error);
        showError('An error occurred while adding influencers');
    } finally {
        hideLoading();
    }
}

async function sendEmailsToInfluencers() {
    const selectedInfluencers = getSelectedInfluencers();
    
    if (selectedInfluencers.length === 0) {
        showError('Please select influencers first');
        return;
    }
    
    const emailTemplate = prompt('Enter your email template (or use default):', 
        'Hi @username,\n\nWe love your content and would like to collaborate on our campaign. Are you interested?\n\nBest regards,\nYour Team');
    
    if (!emailTemplate) return;
    
    try {
        showLoading('Sending emails...');
        
        const response = await fetch('/api/send_emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                campaign_id: currentCampaignId,
                influencer_ids: selectedInfluencers,
                email_template: emailTemplate
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(result.message);
        } else {
            showError(result.message || 'Failed to send emails');
        }
    } catch (error) {
        console.error('Error sending emails:', error);
        showError('An error occurred while sending emails');
    } finally {
        hideLoading();
    }
}

// Campaign Analysis
async function analyzeCampaign() {
    if (!currentCampaignId) {
        currentCampaignId = sessionStorage.getItem('currentCampaignId');
        if (!currentCampaignId) {
            showError('Please create a campaign first');
            return;
        }
    }
    
    try {
        showLoading('Analyzing campaign...');
        
        const response = await fetch('/api/analyze_campaign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                campaign_id: currentCampaignId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            displayCampaignAnalysis(result.analysis);
            showSuccess('Campaign analysis completed!');
        } else {
            showError(result.message || 'Failed to analyze campaign');
        }
    } catch (error) {
        console.error('Error analyzing campaign:', error);
        showError('An error occurred while analyzing the campaign');
    } finally {
        hideLoading();
    }
}

function displayCampaignAnalysis(analysis) {
    const container = document.getElementById('analysisResults');
    if (!container) return;
    
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Campaign Performance Overview</h3>
            </div>
            <div class="grid grid-3">
                <div class="stat-card">
                    <div class="stat-value">${analysis.total_influencers || 0}</div>
                    <div class="stat-label">Total Influencers</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${analysis.avg_brand_fit || 0}%</div>
                    <div class="stat-label">Avg Brand Fit</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${analysis.total_reach || 0}</div>
                    <div class="stat-label">Total Reach</div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Recommendations</h3>
            </div>
            <ul class="recommendations-list">
                ${(analysis.recommendations || []).map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    `;
}

// Utility Functions
function getSelectedInfluencers() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.getAttribute('onchange').match(/'([^']+)'/)[1]);
}

function updateScoreReason(select, influencerId) {
    // Update the score reason for the influencer
    console.log(`Updated score reason for ${influencerId}: ${select.value}`);
}

function toggleInfluencerSelection(influencerId) {
    // Handle influencer selection
    console.log(`Toggled selection for ${influencerId}`);
}

function contactInfluencer(influencerId) {
    // Open contact modal or redirect to contact page
    alert(`Contacting influencer ${influencerId}`);
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Instagram username test
async function handleIgTestSubmit(event){
    event.preventDefault();
    const input = document.getElementById('igUsername');
    const statusEl = document.getElementById('igTestStatus');
    const resultEl = document.getElementById('igTestResult');
    const raw = (input?.value || '').trim();
    if(!raw){ return; }
    const username = raw.replace(/^@+/, '');
    statusEl.textContent = 'Fetching profile...';
    resultEl.innerHTML = '';
    try{
        const res = await fetch(`/api/instagram_profile?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        if(!data.success){
            throw new Error(data.message || 'Failed to fetch profile');
        }
        const p = data.profile || {};
        const proxied = p.profile_pic_url ? `/api/proxy_image?url=${encodeURIComponent(p.profile_pic_url)}` : 'https://via.placeholder.com/80x80/3b82f6/ffffff?text=IG';
        resultEl.innerHTML = `
            <div class="influencer-card" style="max-width:560px;margin:0 auto;">
                <img src="${proxied}" alt="${p.name || p.username || ''}" class="influencer-avatar" referrerpolicy="no-referrer">
                <div class="influencer-name">${p.name || ''}</div>
                <div class="influencer-username">@${p.username || username}</div>
                <div class="influencer-stats">
                    <div class="stat-item"><div class="stat-value"><i class="fas fa-user-group"></i> ${formatNumber(p.followers || 0)}</div><div class="stat-label">Followers</div></div>
                    <div class="stat-item"><div class="stat-value">${formatNumber(p.following || 0)}</div><div class="stat-label">Following</div></div>
                    <div class="stat-item"><div class="stat-value">${formatNumber(p.posts || 0)}</div><div class="stat-label">Posts</div></div>
                </div>
                ${p.biography ? `<p style="margin-top:.75rem;white-space:pre-wrap">${p.biography}</p>` : ''}
                <div style="margin-top:.5rem"><a class="btn btn-secondary" target="_blank" rel="noopener" href="https://instagram.com/${p.username || username}"><i class="fas fa-link"></i> Open Profile</a></div>
            </div>`;
        statusEl.textContent = 'Done';
    }catch(err){
        console.error('IG test error:', err);
        statusEl.textContent = '';
        showError(err.message || 'Failed to fetch profile');
    }
}

function updateSelectedInfluencersUI(selectedIds) {
    // Update UI to show selected influencers
    selectedIds.forEach(id => {
        const checkbox = document.querySelector(`input[onchange*="${id}"]`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

// UI Functions
function showLoading(message = 'Loading...') {
    // Reuse existing overlay if present
    let loadingDiv = document.getElementById('loadingOverlay');
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingOverlay';
    }
    loadingDiv.innerHTML = `
        <div class="loading-overlay">
            <div class="loading-content">
                <div class="loading"></div>
                <p>${message}</p>
            </div>
        </div>
    `;
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 23, 42, 0.35);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    // Auto-timeout cleanup to avoid stuck overlay in edge cases
    loadingDiv.setAttribute('data-created-at', String(Date.now()));
    setTimeout(() => {
        const el = document.getElementById('loadingOverlay');
        if (el) {
            el.remove();
        }
    }, 60000);

    if (!document.body.contains(loadingDiv)) {
        document.body.appendChild(loadingDiv);
    }
}

function showLoadingLong(message = 'Working...'){
    showLoading('');
    const overlay = document.querySelector('#loadingOverlay .loading-content');
    if(overlay){
        overlay.innerHTML = `
            <div class="loading" style="width:28px;height:28px;border-width:4px"></div>
            <p style="margin-top:.75rem;color:var(--text-primary)">${message}</p>
            <p style="font-size:.9rem;color:var(--text-secondary)">Please wait, this can take 30-40 seconds.</p>
        `;
    }
}

function hideLoading() {
    const overlays = document.querySelectorAll('#loadingOverlay');
    overlays.forEach(el => el.remove());
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#8b5cf6'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function handleNavigation(event) {
    // Handle navigation if needed
    console.log('Navigation clicked:', event.target.href);
}

function handleDynamicFormChanges(event) {
    // Handle dynamic form changes
    if (event.target.type === 'checkbox') {
        // Handle checkbox changes
    } else if (event.target.type === 'select-one') {
        // Handle select changes
    }
}

function initializeTooltips() {
    // Initialize tooltips if needed
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(element => {
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function initializeInteractiveElements() {
    // Add hover effects to cards
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });

    // Add ripple effect to buttons
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.addEventListener('click', createRippleEffect);
    });

    // Add floating animation to hero elements
    const heroElements = document.querySelectorAll('.hero-art > *');
    heroElements.forEach((element, index) => {
        element.style.animationDelay = `${index * 0.5}s`;
    });

    // Create floating background elements
    createFloatingElements();
    
    // Add mouse parallax effect
    addMouseParallax();
    
    // Add scroll-triggered animations
    addScrollAnimations();
}

function createFloatingElements() {
    const container = document.body;
    const numElements = 6; // Reduced for better performance
    
    for (let i = 0; i < numElements; i++) {
        const element = document.createElement('div');
        element.className = 'floating-element';
        element.style.cssText = `
            position: fixed;
            width: ${Math.random() * 80 + 60}px;
            height: ${Math.random() * 80 + 60}px;
            background: linear-gradient(135deg, 
                rgba(59, 130, 246, ${Math.random() * 0.3 + 0.2}), 
                rgba(236, 72, 153, ${Math.random() * 0.3 + 0.2}));
            border-radius: 50%;
            filter: blur(${Math.random() * 15 + 15}px);
            top: ${Math.random() * 100}%;
            left: ${Math.random() * 100}%;
            animation: floatElement ${Math.random() * 8 + 12}s ease-in-out infinite;
            animation-delay: ${Math.random() * 8}s;
            z-index: -1;
            pointer-events: none;
            will-change: transform;
        `;
        container.appendChild(element);
    }
}

function addMouseParallax() {
    let ticking = false;
    
    document.addEventListener('mousemove', (e) => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const elements = document.querySelectorAll('.floating-element');
                const mouseX = e.clientX / window.innerWidth;
                const mouseY = e.clientY / window.innerHeight;
                
                elements.forEach((element, index) => {
                    const speed = (index + 1) * 0.3; // Reduced for smoother movement
                    const x = (mouseX - 0.5) * speed * 15;
                    const y = (mouseY - 0.5) * speed * 15;
                    element.style.transform = `translate(${x}px, ${y}px)`;
                });
                ticking = false;
            });
            ticking = true;
        }
    });
}

function addScrollAnimations() {
    let ticking = false;
    
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const scrolled = window.pageYOffset;
                const parallaxElements = document.querySelectorAll('.floating-element');
                
                parallaxElements.forEach((element, index) => {
                    const speed = (index + 1) * 0.05; // Reduced for smoother movement
                    const yPos = -(scrolled * speed);
                    element.style.transform = `translateY(${yPos}px)`;
                });
                ticking = false;
            });
            ticking = true;
        }
    });
}

function createRippleEffect(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
    `;
    
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

function initializeScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all cards and sections
    const elements = document.querySelectorAll('.card, .hero, .features, .flow-diagram');
    elements.forEach(el => {
        observer.observe(el);
    });
}

function showTooltip(event) {
    const tooltip = event.target.getAttribute('data-tooltip');
    if (!tooltip) return;
    
    const tooltipDiv = document.createElement('div');
    tooltipDiv.className = 'tooltip';
    tooltipDiv.textContent = tooltip;
    tooltipDiv.style.cssText = `
        position: absolute;
        background: var(--card-bg);
        color: var(--text-primary);
        padding: 0.5rem;
        border-radius: 4px;
        font-size: 0.875rem;
        z-index: 1000;
        border: 1px solid var(--border-color);
    `;
    
    document.body.appendChild(tooltipDiv);
    
    const rect = event.target.getBoundingClientRect();
    tooltipDiv.style.left = rect.left + 'px';
    tooltipDiv.style.top = (rect.bottom + 5) + 'px';
    
    event.target.tooltipElement = tooltipDiv;
}

function hideTooltip(event) {
    if (event.target.tooltipElement) {
        event.target.tooltipElement.remove();
        event.target.tooltipElement = null;
    }
}

// Page-specific initializations
function initializeCampaignPage() {
    console.log('Initializing campaign page');
    // Add any campaign page specific logic
}

function initializeResultsPage() {
    console.log('Initializing results page');
    // Get campaign ID from session storage
    currentCampaignId = sessionStorage.getItem('currentCampaignId');
    populateCampaignDropdown();
    
    // Load existing influencers if any
    if (currentCampaignId) {
        loadExistingInfluencers();
    }
}

async function populateCampaignDropdown(){
    const select = document.getElementById('campaignSelect');
    if(!select) return;
    select.innerHTML = '<option value="">Loading campaigns...</option>';
    try{
        const res = await fetch('/api/list_campaigns');
        const data = await res.json();
        if(!data.success) throw new Error(data.message || 'Failed to load campaigns');
        const campaigns = data.campaigns || [];
        if(campaigns.length === 0){
            select.innerHTML = '<option value="">No campaigns found</option>';
            return;
        }
        select.innerHTML = '<option value="">Select a campaign...</option>' + campaigns.map(c => {
            const id = c.id || c.campaign_id || '';
            const name = c.campaign_name || c.name || id;
            return `<option value="${id}">${name}</option>`;
        }).join('');
        if(currentCampaignId){ select.value = currentCampaignId; }
    }catch(err){
        console.error('Campaign list error:', err);
        select.innerHTML = '<option value="">Error loading campaigns</option>';
        showError('Could not load campaigns');
    }
}

function initializeAnalysisPage() {
    console.log('Initializing analysis page');
    // Get campaign ID from session storage
    currentCampaignId = sessionStorage.getItem('currentCampaignId');
    
    // Load existing analysis if any
    if (currentCampaignId) {
        loadExistingAnalysis();
    }
}

async function loadExistingInfluencers() {
    // Load existing influencers for the current campaign
    try {
        const response = await fetch(`/api/fetch_campaign_data?campaign_id=${currentCampaignId}`);
        const result = await response.json();
        
        if (result.success && result.campaign_data.influencers) {
            currentInfluencers = result.campaign_data.influencers;
            displayInfluencers(currentInfluencers);
        }
    } catch (error) {
        console.error('Error loading existing influencers:', error);
    }
}

async function loadExistingAnalysis() {
    // Load existing analysis for the current campaign
    try {
        const response = await fetch(`/api/fetch_campaign_data?campaign_id=${currentCampaignId}`);
        const result = await response.json();
        
        if (result.success && result.campaign_data.analysis) {
            displayCampaignAnalysis(result.campaign_data.analysis);
        }
    } catch (error) {
        console.error('Error loading existing analysis:', error);
    }
}

// Export functions for use in HTML
window.handleCampaignSubmit = handleCampaignSubmit;
window.handleInfluencerSearch = handleInfluencerSearch;
window.addInfluencersToCampaign = addInfluencersToCampaign;
window.sendEmailsToInfluencers = sendEmailsToInfluencers;
window.analyzeCampaign = analyzeCampaign;
window.contactInfluencer = contactInfluencer;
window.updateScoreReason = updateScoreReason;
window.toggleInfluencerSelection = toggleInfluencerSelection;
window.handleIgTestSubmit = handleIgTestSubmit;
window.addSingleInfluencer = addSingleInfluencer;
window.viewProfile = viewProfile;

// Add missing functions
function addSingleInfluencer(influencerId) {
    if (selectedInfluencers.includes(influencerId)) {
        showError('Influencer already selected');
        return;
    }
    selectedInfluencers.push(influencerId);
    showSuccess('Influencer added to selection');
}

function viewProfile(username, platform) {
    let url;
    if (platform.toLowerCase() === 'instagram') {
        url = `https://instagram.com/${username}`;
    } else if (platform.toLowerCase() === 'youtube') {
        url = `https://youtube.com/channel/${username}`;
    } else {
        url = `https://instagram.com/${username}`;
    }
    window.open(url, '_blank');
}

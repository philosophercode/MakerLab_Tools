// Configuration
const API_CONFIG = {
    host: window.location.hostname || 'localhost',
    port: window.location.port || '3000',
    get baseUrl() {
        return `http://${this.host}:${this.port}`;
    },
    get apiUrl() {
        return `${this.baseUrl}/api/tools`;
    },
    get imageProxyUrl() {
        return `${this.baseUrl}/api/image`;
    }
};

const API_BASE_URL = API_CONFIG.apiUrl;

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchStatus = document.getElementById('searchStatus');
const resultsContainer = document.getElementById('resultsContainer');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const typeaheadDropdown = document.getElementById('typeaheadDropdown');

// View state
let currentView = localStorage.getItem('viewPreference') || 'grid';
let currentTools = [];
let allTools = []; // Store all tools for typeahead
let selectedSuggestionIndex = -1;
let suggestions = [];

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Fetch tools from API
async function fetchTools(searchQuery = '') {
    try {
        const url = searchQuery 
            ? `${API_BASE_URL}?q=${encodeURIComponent(searchQuery)}`
            : API_BASE_URL;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch tools');
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching tools:', error);
        throw error;
    }
}

// Create tool card element
function createToolCard(tool, isListView = false) {
    const card = document.createElement('div');
    card.className = isListView ? 'tool-card tool-card-list' : 'tool-card';

    const image = document.createElement('img');
    // Use image proxy to avoid CORS issues
    const imageUrl = tool.imageUrl;
    image.src = imageUrl.startsWith('http') 
        ? `${API_CONFIG.imageProxyUrl}?url=${encodeURIComponent(imageUrl)}`
        : imageUrl;
    image.alt = tool.toolName;
    image.className = isListView ? 'tool-image tool-image-thumbnail' : 'tool-image';
    image.loading = 'lazy';
    image.onerror = function() {
        console.warn('Image failed to load:', tool.imageUrl);
        this.src = 'https://placehold.co/200x200?text=Image+Not+Available';
        this.onerror = null;
    };

    if (isListView) {
        // List view layout
        const content = document.createElement('div');
        content.className = 'tool-list-content';
        
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'tool-list-image-wrapper';
        imageWrapper.appendChild(image);
        
        const info = document.createElement('div');
        info.className = 'tool-list-info';
        info.innerHTML = `
            <h2>${escapeHtml(tool.toolName)}</h2>
            <p class="tool-purpose">${escapeHtml(tool.toolPurpose)}</p>
        `;
        
        content.appendChild(imageWrapper);
        content.appendChild(info);
        card.appendChild(content);
    } else {
        // Grid view layout
        card.innerHTML = `
            <h2>${escapeHtml(tool.toolName)}</h2>
        `;
        card.appendChild(image);
        
        const purpose = document.createElement('p');
        purpose.className = 'tool-purpose';
        purpose.textContent = tool.toolPurpose;
        card.appendChild(purpose);
    }

    return card;
}

// Display tools in grid or list view
function displayTools(tools, count) {
    currentTools = tools;
    
    if (tools.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <h2>NO RESULTS FOUND</h2>
                <p>Try a broader term.</p>
            </div>
        `;
        return;
    }

    const container = document.createElement('div');
    container.className = currentView === 'list' ? 'tools-list' : 'tools-grid';

    tools.forEach(tool => {
        const card = createToolCard(tool, currentView === 'list');
        container.appendChild(card);
    });

    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(container);
}

// Toggle view
function setView(view) {
    currentView = view;
    localStorage.setItem('viewPreference', view);
    
    // Update button states
    if (view === 'grid') {
        gridViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
    } else {
        listViewBtn.classList.add('active');
        gridViewBtn.classList.remove('active');
    }
    
    // Re-render with current tools
    if (currentTools.length > 0) {
        displayTools(currentTools, currentTools.length);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update search status message
function updateSearchStatus(query, count) {
    if (!query.trim()) {
        searchStatus.className = 'search-status info';
        searchStatus.textContent = 'Showing all tools in the database.';
        searchStatus.style.display = 'block';
    } else {
        searchStatus.className = 'search-status success';
        searchStatus.textContent = `FOUND ${count} TOOLS`;
        searchStatus.style.display = 'block';
    }
}

// Handle search
async function handleSearch() {
    const query = searchInput.value.trim();
    
    // Show loading state
    resultsContainer.innerHTML = '<div class="loading">Searching...</div>';
    searchStatus.style.display = 'none';

    try {
        const data = await fetchTools(query);
        displayTools(data.data || [], data.count || 0);
        updateSearchStatus(query, data.count || 0);
        
        // Store all tools for typeahead (on first load or when showing all)
        if (allTools.length === 0 || query === '') {
            allTools = data.data || [];
        }
    } catch (error) {
        resultsContainer.innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${escapeHtml(error.message)}
            </div>
        `;
        searchStatus.style.display = 'none';
    }
}

// Generate suggestions from all tools
function generateSuggestions(query) {
    if (!query || query.length < 2) {
        return [];
    }

    const lowerQuery = query.toLowerCase();
    const matches = [];

    allTools.forEach(tool => {
        const toolNameLower = tool.toolName.toLowerCase();
        const toolPurposeLower = tool.toolPurpose.toLowerCase();
        
        let matchType = null;
        let matchText = '';
        
        if (toolNameLower.includes(lowerQuery)) {
            matchType = 'name';
            matchText = tool.toolName;
        } else if (toolPurposeLower.includes(lowerQuery)) {
            matchType = 'purpose';
            matchText = tool.toolPurpose;
        }

        if (matchType) {
            matches.push({
                tool: tool,
                matchType: matchType,
                matchText: matchText,
                query: query
            });
        }
    });

    // Sort by match type (name matches first) and limit to 8
    return matches
        .sort((a, b) => {
            if (a.matchType === 'name' && b.matchType === 'purpose') return -1;
            if (a.matchType === 'purpose' && b.matchType === 'name') return 1;
            return 0;
        })
        .slice(0, 8);
}

// Highlight matching text
function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Display typeahead suggestions
function displaySuggestions(suggestions) {
    if (suggestions.length === 0) {
        typeaheadDropdown.style.display = 'none';
        return;
    }

    typeaheadDropdown.innerHTML = '';
    suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        if (index === selectedSuggestionIndex) {
            item.classList.add('selected');
        }

        if (suggestion.matchType === 'name') {
            item.innerHTML = `
                <div class="suggestion-name">${highlightMatch(suggestion.tool.toolName, suggestion.query)}</div>
                <div class="suggestion-purpose">${escapeHtml(suggestion.tool.toolPurpose)}</div>
            `;
        } else {
            item.innerHTML = `
                <div class="suggestion-name">${escapeHtml(suggestion.tool.toolName)}</div>
                <div class="suggestion-purpose">${highlightMatch(suggestion.tool.toolPurpose, suggestion.query)}</div>
            `;
        }

        item.addEventListener('click', () => {
            selectSuggestion(suggestion.tool.toolName);
        });

        item.addEventListener('mouseenter', () => {
            selectedSuggestionIndex = index;
            updateSuggestionSelection();
        });

        typeaheadDropdown.appendChild(item);
    });

    typeaheadDropdown.style.display = 'block';
}

// Update suggestion selection highlighting
function updateSuggestionSelection() {
    const items = typeaheadDropdown.querySelectorAll('.suggestion-item');
    items.forEach((item, index) => {
        if (index === selectedSuggestionIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

// Select a suggestion
function selectSuggestion(text) {
    searchInput.value = text;
    typeaheadDropdown.style.display = 'none';
    selectedSuggestionIndex = -1;
    handleSearch();
}

// Debounced typeahead function (150ms delay - faster than search)
const debouncedTypeahead = debounce((query) => {
    suggestions = generateSuggestions(query);
    selectedSuggestionIndex = -1;
    displaySuggestions(suggestions);
}, 150);

// Debounced search function (300ms delay)
const debouncedSearch = debounce(handleSearch, 300);

// Event listeners
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // Show typeahead if there's a query
    if (query.length >= 2) {
        debouncedTypeahead(query);
    } else {
        typeaheadDropdown.style.display = 'none';
        suggestions = [];
        selectedSuggestionIndex = -1;
    }
    
    // Also trigger search
    debouncedSearch();
});

// Keyboard navigation for typeahead
searchInput.addEventListener('keydown', (e) => {
    if (typeaheadDropdown.style.display === 'none' || suggestions.length === 0) {
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1);
        updateSuggestionSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateSuggestionSelection();
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedSuggestionIndex].tool.toolName);
    } else if (e.key === 'Escape') {
        typeaheadDropdown.style.display = 'none';
        selectedSuggestionIndex = -1;
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !typeaheadDropdown.contains(e.target)) {
        typeaheadDropdown.style.display = 'none';
    }
});

gridViewBtn.addEventListener('click', () => {
    setView('grid');
});

listViewBtn.addEventListener('click', () => {
    setView('list');
});

// Initial load - show all tools
window.addEventListener('DOMContentLoaded', () => {
    // Set initial view
    setView(currentView);
    handleSearch();
});


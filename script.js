/**
 * GeoNepal GIS - Professional Interactive Web GIS Portal
 * Modular Architecture using ES6+ standards and Leaflet.js
 */

document.addEventListener('DOMContentLoaded', () => {
    const GISApp = {
        // App State
        map: null,
        geoJsonLayers: {},
        labelLayers: {},
        rawGeoData: {},
        activeBaseMap: null,
        activeLayerKey: 'province', // Single active administrative layer
        showLabels: true,
        selectedLabelField: '',

        // Layer Style Configurations
        styles: {
            province: {
                color: '#1d4ed8',
                weight: 2,
                opacity: 0.9,
                fillColor: '#3b82f6',
                fillOpacity: 0.25
            },
            district: {
                color: '#047857',
                weight: 1.5,
                opacity: 0.8,
                fillColor: '#10b981',
                fillOpacity: 0.2
            },
            municipality: {
                color: '#c2410c',
                weight: 1,
                opacity: 0.7,
                fillColor: '#f97316',
                fillOpacity: 0.15
            },
            hover: {
                weight: 3.5,
                color: '#f59e0b',
                fillOpacity: 0.5
            }
        },

        // Tile Providers
        baseMaps: {
            cartoPositron: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap &copy; CARTO'
            }),
            cartoDark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap &copy; CARTO'
            }),
            osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }),
            esriWorld: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 18,
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }),
            openTopo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                maxZoom: 17,
                attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
            })
        },

        // Initialization
        init() {
            this.initTheme();
            this.initMap();
            this.bindUIEvents();
            this.loadGeoJSONData();
        },

        // Local Storage Theme Persistence
        initTheme() {
            const savedTheme = localStorage.getItem('gis_theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.remove('light-theme');
                document.body.classList.add('dark-theme');
                const themeIcon = document.querySelector('#theme-toggle i');
                themeIcon.className = 'fa-solid fa-sun';
            }
        },

        toggleTheme() {
            const isDark = document.body.classList.toggle('dark-theme');
            document.body.classList.toggle('light-theme', !isDark);
            
            const themeIcon = document.querySelector('#theme-toggle i');
            themeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            
            localStorage.setItem('gis_theme', isDark ? 'dark' : 'light');

            if (isDark && this.map.hasLayer(this.baseMaps.cartoPositron)) {
                this.switchBaseMap('cartoDark');
                document.getElementById('basemap-select').value = 'cartoDark';
            } else if (!isDark && this.map.hasLayer(this.baseMaps.cartoDark)) {
                this.switchBaseMap('cartoPositron');
                document.getElementById('basemap-select').value = 'cartoPositron';
            }
        },

        // Map Setup
        initMap() {
            this.map = L.map('map', {
                center: [28.3949, 84.1240],
                zoom: 7,
                zoomControl: false
            });

            const initialBasemap = document.body.classList.contains('dark-theme') ? 'cartoDark' : 'cartoPositron';
            this.activeBaseMap = this.baseMaps[initialBasemap].addTo(this.map);
            document.getElementById('basemap-select').value = initialBasemap;

            L.control.zoom({ position: 'topright' }).addTo(this.map);

            // Centroid Label Groups
            this.labelLayers.province = L.layerGroup();
            this.labelLayers.district = L.layerGroup();
            this.labelLayers.municipality = L.layerGroup();

            this.map.on('mousemove', (e) => {
                document.getElementById('mouse-coordinates').innerText = 
                    `Lat: ${e.latlng.lat.toFixed(5)} | Lng: ${e.latlng.lng.toFixed(5)}`;
            });

            this.map.on('zoomend', () => {
                document.getElementById('active-zoom').innerText = `Zoom: ${this.map.getZoom()}`;
            });

            document.getElementById('active-zoom').innerText = `Zoom: ${this.map.getZoom()}`;
        },

        // Async Data Ingestion
        async loadGeoJSONData() {
            const statusText = document.getElementById('loading-status');
            
            try {
                statusText.innerText = "Fetching Provinces GeoJSON...";
                const resProv = await fetch('PROVINCE.json');
                const provData = await resProv.json();

                statusText.innerText = "Fetching Districts GeoJSON...";
                const resDist = await fetch('DISTRICT.json');
                const distData = await resDist.json();

                statusText.innerText = "Fetching Municipalities GeoJSON...";
                const resMuni = await fetch('MUNICIPALITY.json');
                const muniData = await resMuni.json();

                this.rawGeoData = { province: provData, district: distData, municipality: muniData };

                statusText.innerText = "Rendering Administrative Layers...";
                this.renderGeoJsonLayer('province', provData, this.styles.province);
                this.renderGeoJsonLayer('district', distData, this.styles.district);
                this.renderGeoJsonLayer('municipality', muniData, this.styles.municipality);

                // Initialize with Province Layer
                this.switchActiveLayer('province');

                document.getElementById('loading-screen').classList.add('hidden');

            } catch (error) {
                console.error("GIS Data Load Error:", error);
                statusText.innerHTML = `<span style="color: #ef4444;">Error loading GeoJSON files. Ensure local server execution.</span>`;
            }
        },

        // Render GeoJSON Features
        renderGeoJsonLayer(key, geoJson, defaultStyle) {
            const layer = L.geoJSON(geoJson, {
                style: () => defaultStyle,
                onEachFeature: (feature, featureLayer) => {
                    const props = feature.properties;
                    const defaultName = this.getDefaultFeatureName(props);
                    
                    featureLayer.bindTooltip(defaultName, {
                        sticky: true,
                        direction: 'top',
                        className: 'custom-tooltip'
                    });

                    featureLayer.on({
                        mouseover: (e) => this.highlightFeature(e),
                        mouseout: (e) => this.resetHighlight(e, layer, defaultStyle),
                        click: (e) => this.selectFeature(e, props, key)
                    });
                }
            });

            this.geoJsonLayers[key] = layer;
        },

        // Helper to retrieve standard feature name
        getDefaultFeatureName(props) {
            return props.PR_NAME || props.DISTRICT || props.GaPa_Na || props.FIRST_NAME || props.NAME || "Unknown Region";
        },

        // Switch layer via Radio Button selection
        switchActiveLayer(layerKey) {
            // Remove previous layer and labels
            if (this.geoJsonLayers[this.activeLayerKey] && this.map.hasLayer(this.geoJsonLayers[this.activeLayerKey])) {
                this.map.removeLayer(this.geoJsonLayers[this.activeLayerKey]);
            }
            if (this.labelLayers[this.activeLayerKey] && this.map.hasLayer(this.labelLayers[this.activeLayerKey])) {
                this.map.removeLayer(this.labelLayers[this.activeLayerKey]);
            }

            this.activeLayerKey = layerKey;

            // Add new selected layer
            if (this.geoJsonLayers[layerKey]) {
                this.geoJsonLayers[layerKey].addTo(this.map);
            }

            // Update UI elements dependent on active layer
            this.updateSearchPlaceholder();
            this.updateLabelFieldDropdown();
            this.updateCentroidLabels();
            this.updateLegend();
        },

        // Dynamic Label Options Population based on GeoJSON Feature Properties
        updateLabelFieldDropdown() {
            const dropdown = document.getElementById('label-field-select');
            dropdown.innerHTML = '';

            const geoData = this.rawGeoData[this.activeLayerKey];
            if (!geoData || !geoData.features.length) return;

            const sampleProperties = geoData.features[0].properties;
            const keys = Object.keys(sampleProperties);

            // Priority matching for name-like attributes
            let defaultKey = keys.find(k => ['PR_NAME', 'DISTRICT', 'GaPa_Na', 'FIRST_NAME', 'NAME'].includes(k)) || keys[0];

            keys.forEach(key => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.innerText = key;
                if (key === defaultKey) opt.selected = true;
                dropdown.appendChild(opt);
            });

            this.selectedLabelField = dropdown.value;
        },

        // Generate and Render Labels at Geometric Centroid
        updateCentroidLabels() {
            const currentLabelLayer = this.labelLayers[this.activeLayerKey];
            currentLabelLayer.clearLayers();

            if (!this.showLabels) {
                if (this.map.hasLayer(currentLabelLayer)) {
                    this.map.removeLayer(currentLabelLayer);
                }
                return;
            }

            const geoData = this.rawGeoData[this.activeLayerKey];
            if (!geoData) return;

            geoData.features.forEach(feature => {
                const labelText = String(feature.properties[this.selectedLabelField] ?? '');
                if (!labelText) return;

                let centerCoords;
                try {
                    const centroid = turf.centroid(feature);
                    centerCoords = [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]];
                } catch (err) {
                    const bbox = L.geoJSON(feature).getBounds();
                    const center = bbox.getCenter();
                    centerCoords = [center.lat, center.lng];
                }

                const labelMarker = L.marker(centerCoords, {
                    icon: L.divIcon({
                        className: `map-label map-label-${this.activeLayerKey}`,
                        html: `<span>${labelText}</span>`,
                        iconSize: [120, 20],
                        iconAnchor: [60, 10]
                    }),
                    interactive: false
                });

                currentLabelLayer.addLayer(labelMarker);
            });

            if (!this.map.hasLayer(currentLabelLayer)) {
                this.map.addLayer(currentLabelLayer);
            }
        },

        // Update Search Bar Placeholder dynamically based on selected layer
        updateSearchPlaceholder() {
            const searchInput = document.getElementById('search-input');
            const capKey = this.activeLayerKey.charAt(0).toUpperCase() + this.activeLayerKey.slice(1);
            searchInput.placeholder = `Search ${capKey}...`;
            searchInput.value = '';
            document.getElementById('search-results').classList.remove('active');
            document.getElementById('search-clear').style.display = 'none';
        },

        // Highlight shape on hover
        highlightFeature(e) {
            const layer = e.target;
            layer.setStyle(this.styles.hover);
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                layer.bringToFront();
            }
        },

        resetHighlight(e, parentLayer, defaultStyle) {
            parentLayer.resetStyle(e.target);
        },

        // Select and Display Properties in Sidebar
        selectFeature(e, properties, layerType) {
            const layer = e.target;
            this.map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 12, animate: true });

            const infoContainer = document.getElementById('info-content');
            let rows = '';

            for (const [key, value] of Object.entries(properties)) {
                rows += `<tr><td>${key}</td><td>${value !== null ? value : 'N/A'}</td></tr>`;
            }

            infoContainer.innerHTML = `
                <div style="margin-bottom: 8px; font-weight:700; color:var(--accent-color); font-size:1rem; text-transform:capitalize;">
                    ${layerType} Attribute
                </div>
                <table class="info-table">${rows}</table>
            `;
        },

        // Dynamic Real-time Search within Active Layer
        handleSearch(query) {
            const resultsContainer = document.getElementById('search-results');
            resultsContainer.innerHTML = '';

            if (!query.trim()) {
                resultsContainer.classList.remove('active');
                return;
            }

            const cleanQuery = query.toLowerCase().trim();
            const activeData = this.rawGeoData[this.activeLayerKey];

            if (!activeData) return;

            const filtered = activeData.features.filter(feature => {
                const val = String(feature.properties[this.selectedLabelField] || this.getDefaultFeatureName(feature.properties));
                return val.toLowerCase().includes(cleanQuery);
            }).slice(0, 10);

            if (filtered.length === 0) {
                resultsContainer.innerHTML = `<li style="cursor:default; color:var(--text-secondary);">No ${this.activeLayerKey}s found</li>`;
                resultsContainer.classList.add('active');
                return;
            }

            filtered.forEach(feature => {
                const name = String(feature.properties[this.selectedLabelField] || this.getDefaultFeatureName(feature.properties));
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${name}</span>
                    <span class="type-badge">${this.activeLayerKey}</span>
                `;
                li.addEventListener('click', () => {
                    this.zoomToSearchFeature(feature);
                    resultsContainer.classList.remove('active');
                    document.getElementById('search-input').value = name;
                });
                resultsContainer.appendChild(li);
            });

            resultsContainer.classList.add('active');
        },

        zoomToSearchFeature(feature) {
            const tempLayer = L.geoJSON(feature);
            this.map.fitBounds(tempLayer.getBounds(), { padding: [40, 40], maxZoom: 11 });
            
            tempLayer.setStyle(this.styles.hover).addTo(this.map);
            setTimeout(() => {
                this.map.removeLayer(tempLayer);
            }, 2500);
        },

        // Tile base map switcher
        switchBaseMap(key) {
            if (this.activeBaseMap) {
                this.map.removeLayer(this.activeBaseMap);
            }
            this.activeBaseMap = this.baseMaps[key].addTo(this.map);
        },

        // Map Legend Update
        updateLegend() {
            const legendContainer = document.getElementById('legend-content');
            legendContainer.innerHTML = '';

            const layersInfo = {
                province: { label: 'Provinces', color: 'var(--color-province)' },
                district: { label: 'Districts', color: 'var(--color-district)' },
                municipality: { label: 'Municipalities', color: 'var(--color-municipality)' }
            };

            const activeInfo = layersInfo[this.activeLayerKey];
            if (activeInfo) {
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.innerHTML = `
                    <span class="legend-color" style="background-color: ${activeInfo.color}"></span>
                    <span>${activeInfo.label}</span>
                `;
                legendContainer.appendChild(item);
            }
        },

        // UI Event Listeners
        bindUIEvents() {
            // Theme Toggle
            document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

            // Sidebar Toggle
            document.getElementById('sidebar-toggle').addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('collapsed');
            });

            // Base Map Dropdown
            document.getElementById('basemap-select').addEventListener('change', (e) => {
                this.switchBaseMap(e.target.value);
            });

            // Radio Button Events (Single Active Layer)
            document.querySelectorAll('input[name="admin-layer"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.switchActiveLayer(e.target.value);
                    }
                });
            });

            // Label Visibility Checkbox
            document.getElementById('toggle-labels').addEventListener('change', (e) => {
                this.showLabels = e.target.checked;
                this.updateCentroidLabels();
            });

            // Label Field Attribute Dropdown Selection
            document.getElementById('label-field-select').addEventListener('change', (e) => {
                this.selectedLabelField = e.target.value;
                this.updateCentroidLabels();
            });

            // Search Listener
            const searchInput = document.getElementById('search-input');
            const searchClear = document.getElementById('search-clear');

            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                searchClear.style.display = val ? 'block' : 'none';

                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.handleSearch(val);
                }, 200);
            });

            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.style.display = 'none';
                document.getElementById('search-results').classList.remove('active');
            });

            // Map Control Actions
            document.getElementById('btn-reset-view').addEventListener('click', () => {
                this.map.setView([28.3949, 84.1240], 7);
            });

            document.getElementById('btn-locate').addEventListener('click', () => {
                if (this.geoJsonLayers[this.activeLayerKey]) {
                    this.map.fitBounds(this.geoJsonLayers[this.activeLayerKey].getBounds());
                }
            });
        }
    };

    // Initialize GIS Portal
    GISApp.init();
});

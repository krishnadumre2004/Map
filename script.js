/**
 * GeoNepal GIS Portal Engine
 * Implements Single Active Administrative Layer Control with Centroid Labels,
 * Custom Label Options, and Positioned Controls.
 */

document.addEventListener('DOMContentLoaded', () => {
    const GISApp = {
        map: null,
        geoJsonLayers: {},
        labelLayers: {},
        rawGeoData: {},
        activeLayerKey: 'district', // Default active layer
        activeBaseMap: null,
        searchIndex: [],

        // Styling Configurations
        styles: {
            province: { color: '#1d4ed8', weight: 2, opacity: 0.9, fillColor: '#3b82f6', fillOpacity: 0.25 },
            district: { color: '#047857', weight: 1.5, opacity: 0.8, fillColor: '#10b981', fillOpacity: 0.2 },
            municipality: { color: '#c2410c', weight: 1, opacity: 0.7, fillColor: '#f97316', fillOpacity: 0.15 },
            hover: { weight: 3.5, color: '#f59e0b', fillOpacity: 0.5 }
        },

        // Base Tiles
        baseMaps: {
            cartoPositron: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
            cartoDark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
            osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
            esriWorld: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 }),
            openTopo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 })
        },

        init() {
            this.initTheme();
            this.initMap();
            this.bindUIEvents();
            this.loadGeoJSONData();
        },

        initTheme() {
            const savedTheme = localStorage.getItem('gis_theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.remove('light-theme');
                document.body.classList.add('dark-theme');
                document.querySelector('#theme-toggle i').className = 'fa-solid fa-sun';
            }
        },

        toggleTheme() {
            const isDark = document.body.classList.toggle('dark-theme');
            document.body.classList.toggle('light-theme', !isDark);
            document.querySelector('#theme-toggle i').className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            localStorage.setItem('gis_theme', isDark ? 'dark' : 'light');

            if (isDark && this.map.hasLayer(this.baseMaps.cartoPositron)) {
                this.switchBaseMap('cartoDark');
                document.getElementById('basemap-select').value = 'cartoDark';
            } else if (!isDark && this.map.hasLayer(this.baseMaps.cartoDark)) {
                this.switchBaseMap('cartoPositron');
                document.getElementById('basemap-select').value = 'cartoPositron';
            }
        },

        initMap() {
            this.map = L.map('map', { center: [28.3949, 84.1240], zoom: 7, zoomControl: false });
            const initialBasemap = document.body.classList.contains('dark-theme') ? 'cartoDark' : 'cartoPositron';
            this.activeBaseMap = this.baseMaps[initialBasemap].addTo(this.map);

            L.control.zoom({ position: 'topright' }).addTo(this.map);

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
        },

        async loadGeoJSONData() {
            const statusText = document.getElementById('loading-status');
            try {
                statusText.innerText = "Loading Provinces...";
                const resProv = await fetch('PROVINCE.geojson');
                const provData = await resProv.json();

                statusText.innerText = "Loading Districts...";
                const resDist = await fetch('DISTRICT.geojson');
                const distData = await resDist.json();

                statusText.innerText = "Loading Municipalities...";
                const resMuni = await fetch('MUNICIPALITY.geojson');
                const muniData = await resMuni.json();

                this.rawGeoData = { province: provData, district: distData, municipality: muniData };

                // Ingest Layers
                this.renderGeoJsonLayer('province', provData, this.styles.province);
                this.renderGeoJsonLayer('district', distData, this.styles.district);
                this.renderGeoJsonLayer('municipality', muniData, this.styles.municipality);

                // Set Default Single Active Layer
                this.setActiveAdministrativeLayer('district');

                document.getElementById('loading-screen').classList.add('hidden');
            } catch (err) {
                console.error("Error loading spatial layers:", err);
                statusText.innerHTML = `<span style="color:#ef4444;">Error loading GeoJSON files. Execute via local HTTP Server.</span>`;
            }
        },

        renderGeoJsonLayer(key, geoJson, style) {
            const layer = L.geoJSON(geoJson, {
                style: () => style,
                onEachFeature: (feature, featureLayer) => {
                    const name = this.extractFeatureAttribute(feature.properties, 'NAME');
                    
                    featureLayer.bindTooltip(name, { sticky: true, direction: 'top' });

                    featureLayer.on({
                        mouseover: (e) => e.target.setStyle(this.styles.hover),
                        mouseout: (e) => layer.resetStyle(e.target),
                        click: (e) => this.selectFeature(e, feature.properties, key)
                    });
                }
            });

            this.geoJsonLayers[key] = layer;
        },

        // Helper to resolve property variations
        extractFeatureAttribute(props, attrType) {
            if (attrType === 'NAME') {
                return props.PR_NAME || props.DISTRICT || props.GaPa_Na || props.FIRST_NAME || props.NAME || "Unknown";
            } else if (attrType === 'CODE') {
                return props.PROVINCE || props.DIST_ID || props.OBJECTID || props.CODE || "N/A";
            } else if (attrType === 'AREA') {
                return props.AREA || props.Shape_Area || props.Area_sqkm || "N/A";
            }
            return "N/A";
        },

        // Center Labels Generator
        generateCenterLabels(key) {
            this.labelLayers[key].clearLayers();
            const showLabels = document.getElementById('label-visibility-toggle').checked;
            if (!showLabels || !this.rawGeoData[key]) return;

            const selectedAttr = document.getElementById('label-attribute-select').value;

            this.rawGeoData[key].features.forEach(feature => {
                const labelText = this.extractFeatureAttribute(feature.properties, selectedAttr);
                
                try {
                    const centroid = turf.centroid(feature);
                    const coords = centroid.geometry.coordinates;

                    const labelMarker = L.marker([coords[1], coords[0]], {
                        icon: L.divIcon({
                            className: `map-label`,
                            html: `<span>${labelText}</span>`,
                            iconSize: [120, 20],
                            iconAnchor: [60, 10]
                        }),
                        interactive: false
                    });
                    this.labelLayers[key].addLayer(labelMarker);
                } catch (e) {
                    const bbox = L.geoJSON(feature).getBounds();
                    const center = bbox.getCenter();
                    const labelMarker = L.marker(center, {
                        icon: L.divIcon({
                            className: `map-label`,
                            html: `<span>${labelText}</span>`,
                            iconSize: [120, 20],
                            iconAnchor: [60, 10]
                        }),
                        interactive: false
                    });
                    this.labelLayers[key].addLayer(labelMarker);
                }
            });
        },

        // Radio Layer Switching Logic
        setActiveAdministrativeLayer(key) {
            // Remove current layers from map
            ['province', 'district', 'municipality'].forEach(k => {
                if (this.geoJsonLayers[k]) this.map.removeLayer(this.geoJsonLayers[k]);
                if (this.labelLayers[k]) this.map.removeLayer(this.labelLayers[k]);
            });

            this.activeLayerKey = key;

            // Add selected layer
            if (this.geoJsonLayers[key]) {
                this.geoJsonLayers[key].addTo(this.map);
            }

            // Generate Centroid Labels
            this.generateCenterLabels(key);
            if (this.labelLayers[key]) {
                this.labelLayers[key].addTo(this.map);
            }

            // Update Search UI Context
            this.updateSearchContext(key);

            // Rebuild Search Index for active layer
            this.buildSearchIndex(key);

            // Update Dynamic Legend
            this.updateLegend(key);
        },

        updateSearchContext(key) {
            const capitalKey = key.charAt(0).toUpperCase() + key.slice(1);
            document.getElementById('search-input').placeholder = `Search ${capitalKey}...`;
            document.getElementById('search-section-label').innerText = `Search ${capitalKey}s`;
            
            // Clear input
            document.getElementById('search-input').value = '';
            document.getElementById('search-results').classList.remove('active');
        },

        buildSearchIndex(key) {
            this.searchIndex = [];
            if (this.rawGeoData[key]) {
                this.rawGeoData[key].features.forEach(feature => {
                    const name = this.extractFeatureAttribute(feature.properties, 'NAME');
                    if (name) {
                        this.searchIndex.push({ name: name.toString(), feature: feature });
                    }
                });
            }
        },

        handleSearch(query) {
            const resultsContainer = document.getElementById('search-results');
            resultsContainer.innerHTML = '';

            if (!query.trim()) {
                resultsContainer.classList.remove('active');
                return;
            }

            const cleanQuery = query.toLowerCase().trim();
            const filtered = this.searchIndex.filter(item => 
                item.name.toLowerCase().includes(cleanQuery)
            ).slice(0, 10);

            if (filtered.length === 0) {
                resultsContainer.innerHTML = `<li style="cursor:default; color:var(--text-secondary);">No results found</li>`;
                resultsContainer.classList.add('active');
                return;
            }

            filtered.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${item.name}</span><span class="type-badge">${this.activeLayerKey}</span>`;
                li.addEventListener('click', () => {
                    const tempLayer = L.geoJSON(item.feature);
                    this.map.fitBounds(tempLayer.getBounds(), { padding: [40, 40], maxZoom: 11 });
                    resultsContainer.classList.remove('active');
                    document.getElementById('search-input').value = item.name;
                });
                resultsContainer.appendChild(li);
            });

            resultsContainer.classList.add('active');
        },

        selectFeature(e, properties, layerType) {
            this.map.fitBounds(e.target.getBounds(), { padding: [50, 50], maxZoom: 12 });

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

        switchBaseMap(key) {
            if (this.activeBaseMap) this.map.removeLayer(this.activeBaseMap);
            this.activeBaseMap = this.baseMaps[key].addTo(this.map);
        },

        updateLegend(activeKey) {
            const legendContainer = document.getElementById('legend-content');
            const colorMap = {
                province: 'var(--color-province)',
                district: 'var(--color-district)',
                municipality: 'var(--color-municipality)'
            };

            const capitalName = activeKey.charAt(0).toUpperCase() + activeKey.slice(1);
            
            legendContainer.innerHTML = `
                <div class="legend-item">
                    <span class="legend-color" style="background-color: ${colorMap[activeKey]}"></span>
                    <span>${capitalName} Boundary</span>
                </div>
            `;
        },

        bindUIEvents() {
            document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

            document.getElementById('sidebar-toggle').addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('collapsed');
            });

            document.getElementById('basemap-select').addEventListener('change', (e) => {
                this.switchBaseMap(e.target.value);
            });

            // Single Layer Radio Control
            document.querySelectorAll('input[name="admin-layer"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.setActiveAdministrativeLayer(e.target.value);
                });
            });

            // Dynamic Labels Configurations
            document.getElementById('label-visibility-toggle').addEventListener('change', () => {
                this.generateCenterLabels(this.activeLayerKey);
            });

            document.getElementById('label-attribute-select').addEventListener('change', () => {
                this.generateCenterLabels(this.activeLayerKey);
            });

            // Search Bar Input Listeners
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

    GISApp.init();
});

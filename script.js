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
        searchIndex: [],

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

            // Switch to optimal base map automatically if on Carto basemaps
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
            // Centered on Nepal
            this.map = L.map('map', {
                center: [28.3949, 84.1240],
                zoom: 7,
                zoomControl: false
            });

            // Add Default Tile Layer
            const initialBasemap = document.body.classList.contains('dark-theme') ? 'cartoDark' : 'cartoPositron';
            this.activeBaseMap = this.baseMaps[initialBasemap].addTo(this.map);
            document.getElementById('basemap-select').value = initialBasemap;

            // Add Leaflet Zoom Control to Top Right
            L.control.zoom({ position: 'topright' }).addTo(this.map);

            // Create Layer Groups for Management
            this.labelLayers.province = L.layerGroup().addTo(this.map);
            this.labelLayers.district = L.layerGroup().addTo(this.map);
            this.labelLayers.municipality = L.layerGroup().addTo(this.map);

            // Register Mouse Tracking Events
            this.map.on('mousemove', (e) => {
                document.getElementById('mouse-coordinates').innerText = 
                    `Lat: ${e.latlng.lat.toFixed(5)} | Lng: ${e.latlng.lng.toFixed(5)}`;
            });

            this.map.on('zoomend', () => {
                document.getElementById('active-zoom').innerText = `Zoom: ${this.map.getZoom()}`;
                this.handleLabelVisibilityOnZoom();
            });

            document.getElementById('active-zoom').innerText = `Zoom: ${this.map.getZoom()}`;
        },

        // Async Data Ingestion
        async loadGeoJSONData() {
            const statusText = document.getElementById('loading-status');
            
            try {
                // Fetch All Administrative GeoJSON Layers Parallelly
                statusText.innerText = "Fetching Provinces GeoJSON...";
                const resProv = await fetch('PROVINCE.json');
                const provData = await resProv.json();

                statusText.innerText = "Fetching Districts GeoJSON...";
                const resDist = await fetch('DISTRICT.json');
                const distData = await resDist.json();

                statusText.innerText = "Fetching Municipalities GeoJSON...";
                const resMuni = await fetch('MUNICIPALITY.json');
                const muniData = await resMuni.json();

                // Save Reference
                this.rawGeoData = { province: provData, district: distData, municipality: muniData };

                // Process and Render Layers
                statusText.innerText = "Rendering Administrative Layers...";
                this.renderGeoJsonLayer('municipality', muniData, this.styles.municipality, 1);
                this.renderGeoJsonLayer('district', distData, this.styles.district, 2);
                this.renderGeoJsonLayer('province', provData, this.styles.province, 3);

                // Build Unified Search Index
                this.buildSearchIndex();

                // Update Legend Interface
                this.updateLegend();

                // Hide Loading Screen
                document.getElementById('loading-screen').classList.add('hidden');

            } catch (error) {
                console.error("GIS Data Load Error:", error);
                statusText.innerHTML = `<span style="color: #ef4444;">Error loading GeoJSON files. Ensure local server execution.</span>`;
            }
        },

        // Generic GeoJSON Parser and Layer Engine
        renderGeoJsonLayer(key, geoJson, defaultStyle, zIndex) {
            const layer = L.geoJSON(geoJson, {
                style: () => defaultStyle,
                onEachFeature: (feature, featureLayer) => {
                    // Extract Name dynamically depending on attribute variations
                    const props = feature.properties;
                    const name = props.PR_NAME || props.DISTRICT || props.GaPa_Na || props.FIRST_NAME || props.NAME || "Unknown Region";
                    
                    // Attach Tooltip
                    featureLayer.bindTooltip(name, {
                        sticky: true,
                        direction: 'top',
                        className: 'custom-tooltip'
                    });

                    // Mouse Interaction Events
                    featureLayer.on({
                        mouseover: (e) => this.highlightFeature(e),
                        mouseout: (e) => this.resetHighlight(e, layer, defaultStyle),
                        click: (e) => this.selectFeature(e, props, key)
                    });

                    // Generate Dynamic Polygon Centroid Labels
                    this.createCentroidLabel(feature, name, key);
                }
            });

            // Maintain Layer Order Hierarchy
            this.geoJsonLayers[key] = layer;
            
            // Set layer visibility according to sidebar checkbox state
            const isChecked = document.getElementById(`layer-${key}`).checked;
            if (isChecked) {
                layer.addTo(this.map);
            }
        },

        // Dynamic Polygon Centroid Calculation (via Turf.js integration)
        createCentroidLabel(feature, labelText, layerKey) {
            try {
                const centroid = turf.centroid(feature);
                const coords = centroid.geometry.coordinates;

                const labelMarker = L.marker([coords[1], coords[0]], {
                    icon: L.divIcon({
                        className: `map-label map-label-${layerKey}`,
                        html: `<span>${labelText}</span>`,
                        iconSize: [100, 20],
                        iconAnchor: [50, 10]
                    }),
                    interactive: false
                });

                this.labelLayers[layerKey].addLayer(labelMarker);
            } catch (err) {
                // Fallback for simple geometries
                const bbox = L.geoJSON(feature).getBounds();
                const center = bbox.getCenter();
                const labelMarker = L.marker(center, {
                    icon: L.divIcon({
                        className: `map-label map-label-${layerKey}`,
                        html: `<span>${labelText}</span>`,
                        iconSize: [100, 20],
                        iconAnchor: [50, 10]
                    }),
                    interactive: false
                });
                this.labelLayers[layerKey].addLayer(labelMarker);
            }
        },

        // Hover Effect Functions
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

        // Selection and Attribute Popup Handler
        selectFeature(e, properties, layerType) {
            const layer = e.target;
            this.map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 12, animate: true });

            // Render Spatial Properties into Sidebar Box
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

        // Dynamic Search Index Construction
        buildSearchIndex() {
            this.searchIndex = [];
            const layerKeys = ['province', 'district', 'municipality'];

            layerKeys.forEach(key => {
                if (this.rawGeoData[key]) {
                    this.rawGeoData[key].features.forEach(feature => {
                        const props = feature.properties;
                        const name = props.PR_NAME || props.DISTRICT || props.GaPa_Na || props.FIRST_NAME || props.NAME;
                        if (name) {
                            this.searchIndex.push({
                                name: name.toString(),
                                type: key,
                                feature: feature
                            });
                        }
                    });
                }
            });
        },

        // Real-Time Search Handler
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
            ).slice(0, 10); // Limit results to top 10

            if (filtered.length === 0) {
                resultsContainer.innerHTML = `<li style="cursor:default; color:var(--text-secondary);">No administrative regions found</li>`;
                resultsContainer.classList.add('active');
                return;
            }

            filtered.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${item.name}</span>
                    <span class="type-badge">${item.type}</span>
                `;
                li.addEventListener('click', () => {
                    this.zoomToSearchFeature(item.feature);
                    resultsContainer.classList.remove('active');
                    document.getElementById('search-input').value = item.name;
                });
                resultsContainer.appendChild(li);
            });

            resultsContainer.classList.add('active');
        },

        zoomToSearchFeature(feature) {
            const tempLayer = L.geoJSON(feature);
            this.map.fitBounds(tempLayer.getBounds(), { padding: [40, 40], maxZoom: 11 });
            
            // Highlight temporarily
            tempLayer.setStyle(this.styles.hover).addTo(this.map);
            setTimeout(() => {
                this.map.removeLayer(tempLayer);
            }, 2500);
        },

        // UI Base Map Switcher Engine
        switchBaseMap(key) {
            if (this.activeBaseMap) {
                this.map.removeLayer(this.activeBaseMap);
            }
            this.activeBaseMap = this.baseMaps[key].addTo(this.map);
        },

        // Map Scale Labels Engine Visibility according to Zoom Depth
        handleLabelVisibilityOnZoom() {
            const currentZoom = this.map.getZoom();

            // Municipality Labels visible on higher zooms to avoid clutter
            if (this.labelLayers.municipality) {
                if (currentZoom < 10) {
                    this.map.removeLayer(this.labelLayers.municipality);
                } else if (document.getElementById('layer-municipality').checked) {
                    this.map.addLayer(this.labelLayers.municipality);
                }
            }
        },

        // Dynamic Map Legend Builder
        updateLegend() {
            const legendContainer = document.getElementById('legend-content');
            legendContainer.innerHTML = '';

            const activeLayers = [
                { key: 'province', label: 'Provinces', color: 'var(--color-province)' },
                { key: 'district', label: 'Districts', color: 'var(--color-district)' },
                { key: 'municipality', label: 'Municipalities', color: 'var(--color-municipality)' }
            ];

            activeLayers.forEach(layer => {
                const isChecked = document.getElementById(`layer-${layer.key}`).checked;
                if (isChecked) {
                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    item.innerHTML = `
                        <span class="legend-color" style="background-color: ${layer.color}"></span>
                        <span>${layer.label}</span>
                    `;
                    legendContainer.appendChild(item);
                }
            });
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

            // Toggle Layer Checkboxes
            ['province', 'district', 'municipality'].forEach(key => {
                document.getElementById(`layer-${key}`).addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.map.addLayer(this.geoJsonLayers[key]);
                        this.map.addLayer(this.labelLayers[key]);
                    } else {
                        this.map.removeLayer(this.geoJsonLayers[key]);
                        this.map.removeLayer(this.labelLayers[key]);
                    }
                    this.updateLegend();
                });
            });

            // Live Search Input Listener with Debounce
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
                if (this.geoJsonLayers.province) {
                    this.map.fitBounds(this.geoJsonLayers.province.getBounds());
                }
            });
        }
    };

    // Initialize GIS Portal
    GISApp.init();
});

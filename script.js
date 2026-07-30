document.addEventListener('DOMContentLoaded', () => {
    const GISApp = {
        map: null,
        geoJsonLayers: {},
        labelLayers: {},
        rawGeoData: {},
        activeBaseMap: null,
        activeLayerKey: 'province',
        showLabels: true,
        selectedLabelField: '',

        styles: {
            province: { color: '#1d4ed8', weight: 2, opacity: 0.9, fillColor: '#3b82f6', fillOpacity: 0.25 },
            district: { color: '#047857', weight: 1.5, opacity: 0.8, fillColor: '#10b981', fillOpacity: 0.2 },
            municipality: { color: '#c2410c', weight: 1, opacity: 0.7, fillColor: '#f97316', fillOpacity: 0.15 },
            hover: { weight: 3.5, color: '#f59e0b', fillOpacity: 0.5 }
        },

        baseMaps: {
            cartoPositron: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
            cartoDark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }),
            osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
            esriWorld: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 })
        },

        init() {
            this.initMap();
            this.bindUIEvents();
            this.loadGeoJSONData();
        },

        initMap() {
            this.map = L.map('map', {
                center: [28.3949, 84.1240],
                zoom: 7,
                zoomControl: false
            });

            this.activeBaseMap = this.baseMaps.cartoPositron.addTo(this.map);
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
                const fetchSafe = async (file) => {
                    const res = await fetch(file);
                    if (!res.ok) throw new Error(`Could not load ${file}`);
                    return await res.json();
                };

                statusText.innerText = "Loading Provinces...";
                const provData = await fetchSafe('PROVINCE.json');

                statusText.innerText = "Loading Districts...";
                const distData = await fetchSafe('DISTRICT.json');

                statusText.innerText = "Loading Municipalities...";
                const muniData = await fetchSafe('MUNICIPALITY.json');

                this.rawGeoData = { province: provData, district: distData, municipality: muniData };

                this.renderGeoJsonLayer('province', provData, this.styles.province);
                this.renderGeoJsonLayer('district', distData, this.styles.district);
                this.renderGeoJsonLayer('municipality', muniData, this.styles.municipality);

                this.switchActiveLayer('province');

                document.getElementById('loading-screen').classList.add('hidden');

            } catch (error) {
                console.error("GIS Load Error:", error);
                statusText.innerHTML = `
                    <span style="color: #ef4444; font-weight:bold;">Error loading GeoJSON files.</span><br>
                    <small style="color:var(--text-secondary)">Please ensure you are running through a Web Server or GitHub Pages.</small>
                `;
            }
        },

        renderGeoJsonLayer(key, geoJson, defaultStyle) {
            const layer = L.geoJSON(geoJson, {
                style: () => defaultStyle,
                onEachFeature: (feature, featureLayer) => {
                    const name = this.getFeatureName(feature.properties);
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

        getFeatureName(props) {
            if (!props) return "Unknown";
            return props.PR_NAME || props.DISTRICT || props.GaPa_Na || props.FIRST_NAME || props.NAME || props.DIST_NAME || Object.values(props)[0] || "Unknown";
        },

        switchActiveLayer(layerKey) {
            if (this.geoJsonLayers[this.activeLayerKey] && this.map.hasLayer(this.geoJsonLayers[this.activeLayerKey])) {
                this.map.removeLayer(this.geoJsonLayers[this.activeLayerKey]);
            }
            if (this.labelLayers[this.activeLayerKey] && this.map.hasLayer(this.labelLayers[this.activeLayerKey])) {
                this.map.removeLayer(this.labelLayers[this.activeLayerKey]);
            }

            this.activeLayerKey = layerKey;

            if (this.geoJsonLayers[layerKey]) {
                this.geoJsonLayers[layerKey].addTo(this.map);
            }

            this.updateSearchPlaceholder();
            this.updateLabelFieldDropdown();
            this.updateCentroidLabels();
        },

        updateLabelFieldDropdown() {
            const dropdown = document.getElementById('label-field-select');
            dropdown.innerHTML = '';

            const geoData = this.rawGeoData[this.activeLayerKey];
            if (!geoData || !geoData.features || !geoData.features.length) return;

            const keys = Object.keys(geoData.features[0].properties);

            keys.forEach(key => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.innerText = key;
                dropdown.appendChild(opt);
            });

            let bestMatch = keys.find(k => ['PR_NAME', 'DISTRICT', 'GaPa_Na', 'FIRST_NAME', 'NAME', 'DIST_NAME'].includes(k)) || keys[0];
            dropdown.value = bestMatch;
            this.selectedLabelField = bestMatch;
        },

        updateCentroidLabels() {
            const currentLabelLayer = this.labelLayers[this.activeLayerKey];
            currentLabelLayer.clearLayers();

            if (!this.showLabels) {
                if (this.map.hasLayer(currentLabelLayer)) this.map.removeLayer(currentLabelLayer);
                return;
            }

            const geoData = this.rawGeoData[this.activeLayerKey];
            if (!geoData || !geoData.features) return;

            geoData.features.forEach(feature => {
                const labelText = String(feature.properties[this.selectedLabelField] ?? '');
                if (!labelText) return;

                let centerCoords = null;
                try {
                    if (window.turf) {
                        const centroid = turf.centroid(feature);
                        centerCoords = [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]];
                    }
                } catch (e) {}

                if (!centerCoords) {
                    const center = L.geoJSON(feature).getBounds().getCenter();
                    centerCoords = [center.lat, center.lng];
                }

                const labelMarker = L.marker(centerCoords, {
                    icon: L.divIcon({
                        className: `map-label`,
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

        updateSearchPlaceholder() {
            const searchInput = document.getElementById('search-input');
            const capKey = this.activeLayerKey.charAt(0).toUpperCase() + this.activeLayerKey.slice(1);
            searchInput.placeholder = `Search ${capKey}...`;
            searchInput.value = '';
            document.getElementById('search-results').classList.remove('active');
            document.getElementById('search-clear').style.display = 'none';
        },

        selectFeature(e, properties, layerType) {
            this.map.fitBounds(e.target.getBounds(), { padding: [50, 50], maxZoom: 12, animate: true });

            let rows = '';
            for (const [key, value] of Object.entries(properties)) {
                rows += `<tr><td>${key}</td><td>${value !== null ? value : 'N/A'}</td></tr>`;
            }

            document.getElementById('info-content').innerHTML = `
                <div style="margin-bottom: 8px; font-weight:700; color:var(--accent-color); text-transform:capitalize;">
                    ${layerType} Attribute
                </div>
                <table class="info-table">${rows}</table>
            `;
        },

        handleSearch(query) {
            const resultsContainer = document.getElementById('search-results');
            resultsContainer.innerHTML = '';

            if (!query.trim()) {
                resultsContainer.classList.remove('active');
                return;
            }

            const activeData = this.rawGeoData[this.activeLayerKey];
            if (!activeData) return;

            const filtered = activeData.features.filter(f => {
                const val = String(f.properties[this.selectedLabelField] || this.getFeatureName(f.properties));
                return val.toLowerCase().includes(query.toLowerCase().trim());
            }).slice(0, 10);

            if (filtered.length === 0) {
                resultsContainer.innerHTML = `<li style="cursor:default;">No regions found</li>`;
                resultsContainer.classList.add('active');
                return;
            }

            filtered.forEach(feature => {
                const name = String(feature.properties[this.selectedLabelField] || this.getFeatureName(feature.properties));
                const li = document.createElement('li');
                li.innerHTML = `<span>${name}</span><span class="type-badge">${this.activeLayerKey}</span>`;
                li.addEventListener('click', () => {
                    const temp = L.geoJSON(feature);
                    this.map.fitBounds(temp.getBounds(), { padding: [40, 40], maxZoom: 11 });
                    resultsContainer.classList.remove('active');
                    document.getElementById('search-input').value = name;
                });
                resultsContainer.appendChild(li);
            });

            resultsContainer.classList.add('active');
        },

        bindUIEvents() {
            document.querySelectorAll('input[name="admin-layer"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) this.switchActiveLayer(e.target.value);
                });
            });

            document.getElementById('toggle-labels').addEventListener('change', (e) => {
                this.showLabels = e.target.checked;
                this.updateCentroidLabels();
            });

            document.getElementById('label-field-select').addEventListener('change', (e) => {
                this.selectedLabelField = e.target.value;
                this.updateCentroidLabels();
            });

            document.getElementById('basemap-select').addEventListener('change', (e) => {
                if (this.activeBaseMap) this.map.removeLayer(this.activeBaseMap);
                this.activeBaseMap = this.baseMaps[e.target.value].addTo(this.map);
            });

            document.getElementById('btn-reset-view').addEventListener('click', () => {
                this.map.setView([28.3949, 84.1240], 7);
            });

            document.getElementById('sidebar-toggle').addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('collapsed');
            });

            const searchInput = document.getElementById('search-input');
            const searchClear = document.getElementById('search-clear');

            let timer;
            searchInput.addEventListener('input', (e) => {
                searchClear.style.display = e.target.value ? 'block' : 'none';
                clearTimeout(timer);
                timer = setTimeout(() => this.handleSearch(e.target.value), 200);
            });

            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.style.display = 'none';
                document.getElementById('search-results').classList.remove('active');
            });
        }
    };

    GISApp.init();
});

<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Space Syntax 보로노이 평면 배치</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 20px;
        }
        
        .controls {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            height: fit-content;
        }
        
        .visualization {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 20px;
        }
        
        #canvas {
            width: 100%;
            height: 700px;
            border: 1px solid #ddd;
            cursor: grab;
        }
        
        #canvas.dragging {
            cursor: grabbing;
        }
        
        .file-input {
            margin-bottom: 15px;
        }
        
        .file-input label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        
        .file-input input {
            width: 100%;
            padding: 5px;
        }
        
        .floor-filter {
            margin: 20px 0;
        }
        
        .floor-filter label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        
        .floor-filter select {
            width: 100%;
            padding: 5px;
        }
        
        .slider-container {
            margin: 20px 0;
        }
        
        .slider-container label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        
        .slider-container input[type="range"] {
            width: 100%;
        }
        
        .slider-value {
            text-align: right;
            font-size: 14px;
            color: #666;
        }
        
        .button-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
        }
        
        .status {
            margin-top: 20px;
            padding: 10px;
            border-radius: 4px;
            font-size: 14px;
        }
        
        .status.satisfied {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .status.unsatisfied {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .status.optimizing {
            background-color: #cce5ff;
            color: #004085;
            border: 1px solid #b8daff;
        }
        
        .legend {
            margin-top: 20px;
        }
        
        .legend h3 {
            margin-bottom: 10px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            font-size: 14px;
        }
        
        .legend-color {
            width: 20px;
            height: 20px;
            margin-right: 10px;
            border: 1px solid #333;
        }
        
        button {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
        }
        
        button:hover {
            background-color: #0056b3;
        }
        
        button:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
        }
        
        button.stop {
            background-color: #dc3545;
        }
        
        button.stop:hover {
            background-color: #c82333;
        }
        
        .voronoi-cell {
            fill-opacity: 0.3;
            stroke: #333;
            stroke-width: 1.5;
        }
        
        .voronoi-cell.connected {
            fill: #28a745;
        }
        
        .voronoi-cell.unconnected {
            fill: #dc3545;
        }
        
        .voronoi-cell.partial {
            fill: #ffc107;
        }
        
        .voronoi-site {
            fill: #333;
            cursor: move;
        }
        
        .voronoi-site:hover {
            fill: #0056b3;
        }
        
        .voronoi-site.fixed:hover {
            fill: #cc0000;
            transform: scale(1.1);
            transition: transform 0.2s;
        }
        
        .voronoi-site.fixed {
            cursor: move;
            stroke: #fff;
            stroke-width: 2;
        }
        
        .connection-line {
            stroke: #ff6b6b;
            stroke-width: 2;
            stroke-dasharray: 5,5;
            fill: none;
            opacity: 0.5;
        }
        
        .room-label {
            font-size: 12px;
            pointer-events: none;
            text-anchor: middle;
            font-weight: bold;
        }
        
        .tooltip {
            position: absolute;
            padding: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 4px;
            pointer-events: none;
            font-size: 14px;
            z-index: 1000;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="controls">
            <h2>Space Syntax 보로노이 배치</h2>
            
            <div class="file-input">
                <label for="boundary">경계 (GeoJSON):</label>
                <input type="file" id="boundary" accept=".json,.geojson">
            </div>
            
            <div class="file-input">
                <label for="matrix">Matrix (CSV):</label>
                <input type="file" id="matrix" accept=".csv">
            </div>
            
            <div class="floor-filter">
                <label for="floor">층 선택:</label>
                <select id="floor" disabled>
                    <option value="">파일을 먼저 업로드하세요</option>
                </select>
            </div>
            
            <div class="slider-container">
                <label for="dummyCount">더미 노드 개수:</label>
                <input type="range" id="dummyCount" min="0" max="200" value="50" step="5">
                <div class="slider-value dummy-count-value">50</div>
            </div>
            
            <div class="slider-container">
                <label for="repulsion">척력 강도:</label>
                <input type="range" id="repulsion" min="10" max="5000" value="50" step="10">
                <div class="slider-value repulsion-value">50</div>
            </div>
            
            <div class="slider-container">
                <label for="attraction">인력 강도:</label>
                <input type="range" id="attraction" min="0" max="100" value="30" step="5">
                <div class="slider-value attraction-value">30</div>
            </div>
            
            <div class="slider-container">
                <label for="damping">감쇠 계수 (안정화 속도):</label>
                <input type="range" id="damping" min="50" max="99" value="90" step="1">
                <div class="slider-value damping-value">0.90</div>
            </div>
            
            <button id="randomize" disabled>랜덤 재배치</button>
            
            <div class="button-group">
                <button id="optimize-start" disabled>최적화 시작</button>
                <button id="optimize-stop" class="stop" disabled>최적화 멈춤</button>
            </div>
            
            <div class="legend">
                <h3>범례</h3>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #28a745;"></div>
                    <span>모든 연결 만족</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #ffc107;"></div>
                    <span>일부 연결 만족</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #dc3545;"></div>
                    <span>연결 불만족</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #ff0000; border-radius: 50%; width: 20px; height: 20px; border: 2px solid #fff;"></div>
                    <span>중심 고정 노드 (드래그 가능)</span>
                </div>
            </div>
            
            <div id="status" class="status"></div>
        </div>
        
        <div class="visualization">
            <svg id="canvas"></svg>
        </div>
    </div>
    
    <div class="tooltip" style="display: none;"></div>

    <script>
        // 전역 변수
        let boundary = null;
        let matrixData = null;
        let rooms = [];
        let connections = {};
        let voronoi = null;
        let svg = null;
        let sites = [];
        let draggedSite = null;
        let repulsionForce = 50;
        let attractionForce = 30;
        let dummyNodeCount = 50;
        let optimizationRunning = false;
        let animationId = null;
        let repulsionAnimationId = null;
        let clipPathId = 'boundary-clip';
        let damping = 0.9;
        let optimizationStep = 0;
        let bestScore = 0;
        let currentScore = 0;
        let centerNodeId = null;
        let boundaryCenter = null;
        let totalRequired = 0;
        let totalKineticEnergy = 0;
        
        // SVG 초기화
        const svgElement = d3.select("#canvas");
        const width = 1000;
        const height = 700;
        
        // 파일 업로드 핸들러
        document.getElementById('boundary').addEventListener('change', handleBoundaryUpload);
        document.getElementById('matrix').addEventListener('change', handleMatrixUpload);
        document.getElementById('floor').addEventListener('change', filterByFloor);
        document.getElementById('randomize').addEventListener('click', randomizeSites);
        document.getElementById('optimize-start').addEventListener('click', startOptimization);
        document.getElementById('optimize-stop').addEventListener('click', stopOptimization);
        
        // 더미 노드 개수 슬라이더 핸들러
        document.getElementById('dummyCount').addEventListener('input', function(e) {
            dummyNodeCount = parseInt(e.target.value);
            document.querySelector('.dummy-count-value').textContent = dummyNodeCount;
            
            // 최적화가 실행 중이 아닐 때만 재초기화
            if (!optimizationRunning && rooms.length > 0) {
                initializeSites();
                updateVisualization();
                startRepulsionAnimation();
            }
        });
        
        // 척력 슬라이더 핸들러
        document.getElementById('repulsion').addEventListener('input', function(e) {
            repulsionForce = parseInt(e.target.value);
            document.querySelector('.repulsion-value').textContent = repulsionForce;
        });
        
        // 인력 슬라이더 핸들러
        document.getElementById('attraction').addEventListener('input', function(e) {
            attractionForce = parseInt(e.target.value);
            document.querySelector('.attraction-value').textContent = attractionForce;
        });
        
        // 감쇠 슬라이더 핸들러
        document.getElementById('damping').addEventListener('input', function(e) {
            damping = parseInt(e.target.value) / 100;
            document.querySelector('.damping-value').textContent = damping.toFixed(2);
        });
        
        // 애니메이션 정리
        window.addEventListener('beforeunload', function() {
            if (animationId) cancelAnimationFrame(animationId);
            if (repulsionAnimationId) cancelAnimationFrame(repulsionAnimationId);
        });
        
        function handleBoundaryUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const geojson = JSON.parse(event.target.result);
                    boundary = processBoundary(geojson);
                    updateVisualization();
                    if (sites.length > 0) {
                        startRepulsionAnimation();
                    }
                } catch (error) {
                    alert('GeoJSON 파일 읽기 오류: ' + error.message);
                }
            };
            reader.readAsText(file);
        }
        
        function processBoundary(geojson) {
            // GeoJSON에서 좌표 추출 (첫 번째 feature의 좌표 사용)
            let coordinates = [];
            
            if (geojson.type === 'FeatureCollection' && geojson.features.length > 0) {
                coordinates = geojson.features[0].geometry.coordinates[0];
            } else if (geojson.type === 'Feature') {
                coordinates = geojson.geometry.coordinates[0];
            } else if (geojson.coordinates) {
                coordinates = geojson.coordinates[0];
            }
            
            // 좌표를 SVG 공간에 맞게 변환
            const bounds = getBounds(coordinates);
            const scale = Math.min(
                (width - 100) / (bounds.maxX - bounds.minX),
                (height - 100) / (bounds.maxY - bounds.minY)
            );
            
            const transformed = coordinates.map(coord => [
                50 + (coord[0] - bounds.minX) * scale,
                50 + (coord[1] - bounds.minY) * scale
            ]);
            
            // 경계 중심점 계산
            boundaryCenter = calculatePolygonCenter(transformed);
            
            return transformed;
        }
        
        function calculatePolygonCenter(polygon) {
            let x = 0, y = 0;
            polygon.forEach(point => {
                x += point[0];
                y += point[1];
            });
            return { x: x / polygon.length, y: y / polygon.length };
        }
        
        function getBounds(coordinates) {
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            
            coordinates.forEach(coord => {
                minX = Math.min(minX, coord[0]);
                minY = Math.min(minY, coord[1]);
                maxX = Math.max(maxX, coord[0]);
                maxY = Math.max(maxY, coord[1]);
            });
            
            return { minX, minY, maxX, maxY };
        }
        
        function handleMatrixUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            Papa.parse(file, {
                complete: function(results) {
                    matrixData = processMatrix(results.data);
                    updateFloorFilter();
                    filterByFloor();
                },
                error: function(error) {
                    alert('CSV 파일 읽기 오류: ' + error.message);
                }
            });
        }
        
        function processMatrix(data) {
            const matrix = [];
            const roomInfo = {};
            
            // 첫 행에서 실 정보 추출
            for (let j = 1; j < data[0].length; j++) {
                const [name, floor, area] = data[0][j].split('%');
                roomInfo[j-1] = { name, floor, area: parseFloat(area) || 0 };
            }
            
            // 연결성 매트릭스 구축
            for (let i = 1; i < data.length; i++) {
                const row = [];
                for (let j = 1; j < data[i].length; j++) {
                    row.push(parseFloat(data[i][j]) || 0);
                }
                matrix.push(row);
            }
            
            return { roomInfo, matrix };
        }
        
        function updateFloorFilter() {
            const floors = new Set();
            Object.values(matrixData.roomInfo).forEach(room => {
                floors.add(room.floor);
            });
            
            const select = document.getElementById('floor');
            select.innerHTML = '<option value="">모든 층</option>';
            floors.forEach(floor => {
                const option = document.createElement('option');
                option.value = floor;
                option.textContent = floor;
                select.appendChild(option);
            });
            
            select.disabled = false;
            document.getElementById('randomize').disabled = false;
            document.getElementById('optimize-start').disabled = false;
        }
        
        function filterByFloor() {
            if (!matrixData) return;
            
            const selectedFloor = document.getElementById('floor').value;
            rooms = [];
            connections = {};
            
            // 선택된 층의 실들과 CR 실들 필터링
            Object.entries(matrixData.roomInfo).forEach(([idx, room]) => {
                if (!selectedFloor || room.floor === selectedFloor || room.floor === 'CR') {
                    rooms.push({
                        id: parseInt(idx),
                        ...room
                    });
                }
            });
            
            // 연결성 정보 구축
            totalRequired = 0;
            rooms.forEach((room1, i) => {
                connections[room1.id] = [];
                rooms.forEach((room2, j) => {
                    if (i !== j && matrixData.matrix[room1.id][room2.id] > 0) {
                        connections[room1.id].push(room2.id);
                        totalRequired++;
                    }
                });
            });
            totalRequired = totalRequired / 2; // 양방향 연결이므로 2로 나눔
            
            // 가장 연결성이 높은 노드 찾기
            centerNodeId = null;
            let maxConnections = 0;
            rooms.forEach(room => {
                const connectionCount = (connections[room.id] || []).length;
                if (connectionCount > maxConnections) {
                    maxConnections = connectionCount;
                    centerNodeId = room.id;
                }
            });
            
            initializeSites();
            updateVisualization();
            startRepulsionAnimation();
        }
        
        function initializeSites() {
            if (!boundary || rooms.length === 0) return;
            
            sites = [];
            
            // 실제 방들을 위한 사이트
            rooms.forEach((room, i) => {
                let x, y;
                
                // 중심 노드는 경계 중심에 고정
                if (centerNodeId !== null && room.id === centerNodeId && boundaryCenter) {
                    x = boundaryCenter.x;
                    y = boundaryCenter.y;
                } else {
                    const angle = (i / rooms.length) * 2 * Math.PI;
                    const radius = Math.min(width, height) * 0.3;
                    x = width / 2 + radius * Math.cos(angle);
                    y = height / 2 + radius * Math.sin(angle);
                }
                
                sites.push({
                    x: x,
                    y: y,
                    vx: 0,
                    vy: 0,
                    room: room,
                    isDummy: false,
                    isFixed: (centerNodeId !== null && room.id === centerNodeId)
                });
            });
            
            // 더미 노드 추가
            const bounds = {
                minX: Math.min(...boundary.map(p => p[0])),
                maxX: Math.max(...boundary.map(p => p[0])),
                minY: Math.min(...boundary.map(p => p[1])),
                maxY: Math.max(...boundary.map(p => p[1]))
            };
            
            for (let i = 0; i < dummyNodeCount; i++) {
                let x, y;
                let attempts = 0;
                
                // 경계 내부에 위치하도록 확인
                do {
                    x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
                    y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
                    attempts++;
                } while (!isPointInPolygon([x, y], boundary) && attempts < 100);
                
                if (attempts < 100) {
                    sites.push({
                        x: x,
                        y: y,
                        vx: 0,
                        vy: 0,
                        isDummy: true,
                        isFixed: false,
                        dummyId: i
                    });
                }
            }
        }
        
        function isPointInPolygon(point, polygon) {
            let inside = false;
            const x = point[0], y = point[1];
            
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i][0], yi = polygon[i][1];
                const xj = polygon[j][0], yj = polygon[j][1];
                
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                    inside = !inside;
                }
            }
            
            return inside;
        }
        
        function randomizeSites() {
            if (!boundary) return;
            
            const bounds = {
                minX: Math.min(...boundary.map(p => p[0])),
                maxX: Math.max(...boundary.map(p => p[0])),
                minY: Math.min(...boundary.map(p => p[1])),
                maxY: Math.max(...boundary.map(p => p[1]))
            };
            
            sites.forEach(site => {
                // 고정된 노드는 움직이지 않음
                if (site.isFixed) return;
                
                let attempts = 0;
                let x, y;
                
                do {
                    x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
                    y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
                    attempts++;
                } while (!isPointInPolygon([x, y], boundary) && attempts < 100);
                
                if (attempts < 100) {
                    site.x = x;
                    site.y = y;
                    site.vx = 0;
                    site.vy = 0;
                }
            });
            
            updateVisualization();
            startRepulsionAnimation();
        }
        
        function updateVisualization() {
            if (!boundary) return;
            
            // SVG 초기화
            svgElement.selectAll("*").remove();
            svg = svgElement
                .attr("width", width)
                .attr("height", height)
                .attr("viewBox", [0, 0, width, height]);
            
            // 클리핑 패스 정의
            svg.append("defs")
                .append("clipPath")
                .attr("id", clipPathId)
                .append("path")
                .datum(boundary)
                .attr("d", d3.line());
            
            // 경계 그리기
            svg.append("path")
                .datum(boundary)
                .attr("fill", "none")
                .attr("stroke", "#333")
                .attr("stroke-width", 2)
                .attr("d", d3.line());
            
            if (sites.length === 0) return;
            
            // 보로노이 다이어그램 생성
            const delaunay = d3.Delaunay.from(sites, d => d.x, d => d.y);
            voronoi = delaunay.voronoi([0, 0, width, height]);
            
            // 연결성 확인 및 시각화
            const adjacencyMap = getAdjacencyMap();
            const connectionStatus = checkConnections(adjacencyMap);
            
            // 현재 점수 계산
            if (rooms.length > 0) {
                currentScore = Object.values(connectionStatus)
                    .reduce((sum, status) => sum + status.satisfied, 0);
            }
            
            // 클리핑 그룹
            const clippedGroup = svg.append("g")
                .attr("clip-path", `url(#${clipPathId})`);
            
            // 보로노이 셀 그리기 (클리핑 적용)
            const cells = clippedGroup.append("g")
                .selectAll("path")
                .data(sites)
                .join("path")
                .attr("class", d => {
                    if (d.isDummy) return "voronoi-cell";
                    const status = connectionStatus[d.room.id];
                    if (status.required === 0) return "voronoi-cell connected";
                    if (status.satisfied === status.required) return "voronoi-cell connected";
                    if (status.satisfied > 0) return "voronoi-cell partial";
                    return "voronoi-cell unconnected";
                })
                .attr("d", (d, i) => voronoi.renderCell(i))
                .style("fill", d => {
                    if (d.isDummy) return "none";
                    return null;
                })
                .style("stroke", d => d.isDummy ? "#999" : "#333")
                .style("stroke-width", d => d.isDummy ? 0.5 : 1.5);
            
            // 연결선 그리기 (만족되지 않은 연결, 더미 노드 제외)
            const connectionLines = svg.append("g")
                .selectAll("line")
                .data(getUnsatisfiedConnections(adjacencyMap))
                .join("line")
                .attr("class", "connection-line")
                .attr("x1", d => sites.find(s => s.room && s.room.id === d.from).x)
                .attr("y1", d => sites.find(s => s.room && s.room.id === d.from).y)
                .attr("x2", d => sites.find(s => s.room && s.room.id === d.to).x)
                .attr("y2", d => sites.find(s => s.room && s.room.id === d.to).y);
            
            // 사이트 점 그리기
            const siteDots = svg.append("g")
                .selectAll("circle")
                .data(sites)
                .join("circle")
                .attr("class", d => d.isFixed ? "voronoi-site fixed" : "voronoi-site")
                .attr("cx", d => d.x)
                .attr("cy", d => d.y)
                .attr("r", d => {
                    if (d.isDummy) return 2.5;
                    if (d.isFixed) return 7;
                    return 5;
                })
                .style("fill", d => {
                    if (d.isDummy) return "#666";
                    if (d.isFixed) return "#ff0000";
                    return "#333";
                })
                .style("opacity", d => d.isDummy ? 0.5 : 1)
                .style("stroke", d => d.isFixed ? "#fff" : "none")
                .style("stroke-width", d => d.isFixed ? 2 : 0)
                .call(d3.drag()
                    .on("start", dragStarted)
                    .on("drag", dragged)
                    .on("end", dragEnded));
            
            // 실 이름 라벨 (더미 노드 제외)
            const labels = svg.append("g")
                .selectAll("text")
                .data(sites.filter(s => !s.isDummy))
                .join("text")
                .attr("class", "room-label")
                .attr("x", d => d.x)
                .attr("y", d => d.y - 10)
                .text(d => d.room.name);
            
            // 툴팁 이벤트 (더미 노드 제외)
            siteDots.filter(d => !d.isDummy)
                .on("mouseover", showTooltip)
                .on("mouseout", hideTooltip);
            
            // 상태 업데이트
            updateStatus(connectionStatus);
        }
        
        function getAdjacencyMap() {
            if (!voronoi) return {};
            
            const adjacencyMap = {};
            
            sites.forEach((site, i) => {
                if (!site.isDummy && site.room) {
                    adjacencyMap[site.room.id] = [];
                    const neighbors = [...voronoi.delaunay.neighbors(i)];
                    
                    neighbors.forEach(j => {
                        if (sites[j] && !sites[j].isDummy && sites[j].room) {
                            adjacencyMap[site.room.id].push(sites[j].room.id);
                        }
                    });
                }
            });
            
            return adjacencyMap;
        }
        
        function checkConnections(adjacencyMap) {
            const status = {};
            
            rooms.forEach(room => {
                const required = connections[room.id] || [];
                const adjacent = adjacencyMap[room.id] || [];
                const satisfied = required.filter(reqId => adjacent.includes(reqId)).length;
                
                status[room.id] = {
                    required: required.length,
                    satisfied: satisfied,
                    missing: required.filter(reqId => !adjacent.includes(reqId))
                };
            });
            
            return status;
        }
        
        function getUnsatisfiedConnections(adjacencyMap) {
            const unsatisfied = [];
            
            rooms.forEach(room => {
                const required = connections[room.id] || [];
                const adjacent = adjacencyMap[room.id] || [];
                
                required.forEach(reqId => {
                    if (!adjacent.includes(reqId) && reqId > room.id) {
                        unsatisfied.push({ from: room.id, to: reqId });
                    }
                });
            });
            
            return unsatisfied;
        }
        
        function updateStatus(connectionStatus) {
            const totalSatisfied = currentScore;
            
            const statusDiv = document.getElementById('status');
            
            let statusText = '';
            if (totalRequired === 0) {
                statusDiv.className = 'status satisfied';
                statusText = '연결 요구사항 없음';
            } else if (totalSatisfied === totalRequired) {
                statusDiv.className = 'status satisfied';
                statusText = `모든 연결 조건 만족! (${totalSatisfied}/${totalRequired})`;
            } else {
                statusDiv.className = optimizationRunning ? 'status optimizing' : 'status unsatisfied';
                statusText = `연결 조건: ${totalSatisfied}/${totalRequired}`;
            }
            
            if (optimizationRunning) {
                statusText += ` | 최적화 중... (최고: ${bestScore}/${totalRequired})`;
                if (totalKineticEnergy < 1) {
                    statusText += ` | 안정화 중...`;
                }
            }
            
            statusDiv.textContent = statusText;
        }
        
        // 드래그 핸들러
        function dragStarted(event, d) {
            d3.select(this).raise()
                .attr("r", d.isDummy ? 4 : (d.isFixed ? 9 : 8))
                .style("fill", d.isFixed ? "#ff6666" : null);
            draggedSite = d;
            svgElement.classed("dragging", true);
        }
        
        function dragged(event, d) {
            const [x, y] = d3.pointer(event, svg.node());
            
            // 경계 내부에 있는지 확인
            if (isPointInPolygon([x, y], boundary)) {
                d.x = x;
                d.y = y;
                
                // 속도 초기화 (갑작스러운 움직임 방지)
                d.vx = 0;
                d.vy = 0;
                
                // 고정 노드의 경우 중심점도 업데이트
                if (d.isFixed && boundaryCenter) {
                    boundaryCenter.x = x;
                    boundaryCenter.y = y;
                }
                
                updateVisualization();
            }
        }
        
        function dragEnded(event, d) {
            d3.select(this)
                .attr("r", d.isDummy ? 2.5 : (d.isFixed ? 7 : 5))
                .style("fill", d.isDummy ? "#666" : (d.isFixed ? "#ff0000" : "#333"));
            draggedSite = null;
            svgElement.classed("dragging", false);
        }
        
        // 툴팁 핸들러
        function showTooltip(event, d) {
            const tooltip = d3.select('.tooltip');
            const status = checkConnections(getAdjacencyMap())[d.room.id];
            
            let fixedText = d.isFixed ? ' (중심 고정 - 드래그 가능)' : '';
            
            tooltip.html(`
                <strong>${d.room.name}${fixedText}</strong><br>
                층: ${d.room.floor}<br>
                면적: ${d.room.area}㎡<br>
                연결 상태: ${status.satisfied}/${status.required}
            `)
            .style('display', 'block')
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
        }
        
        function hideTooltip() {
            d3.select('.tooltip').style('display', 'none');
        }
        
        // 척력 애니메이션
        function startRepulsionAnimation() {
            if (repulsionAnimationId) {
                cancelAnimationFrame(repulsionAnimationId);
            }
            repulsionStep();
        }
        
        function repulsionStep() {
            if (sites.length > 0) {
                applyRepulsion();
                // 직접 DOM 업데이트 (무한 루프 방지)
                if (svg) {
                    svg.selectAll("circle.voronoi-site")
                        .data(sites)
                        .attr("cx", d => d.x)
                        .attr("cy", d => d.y);
                    
                    svg.selectAll("text.room-label")
                        .data(sites.filter(s => !s.isDummy))
                        .attr("x", d => d.x)
                        .attr("y", d => d.y - 10);
                    
                    // 보로노이 다이어그램 재계산 및 업데이트
                    if (sites.length > 0) {
                        const delaunay = d3.Delaunay.from(sites, d => d.x, d => d.y);
                        voronoi = delaunay.voronoi([0, 0, width, height]);
                        
                        const adjacencyMap = getAdjacencyMap();
                        const connectionStatus = checkConnections(adjacencyMap);
                        
                        // 보로노이 셀 업데이트
                        svg.select("g").selectAll("path")
                            .data(sites)
                            .attr("d", (d, i) => voronoi.renderCell(i))
                            .attr("class", d => {
                                if (d.isDummy) return "voronoi-cell";
                                const status = connectionStatus[d.room.id];
                                if (status.required === 0) return "voronoi-cell connected";
                                if (status.satisfied === status.required) return "voronoi-cell connected";
                                if (status.satisfied > 0) return "voronoi-cell partial";
                                return "voronoi-cell unconnected";
                            });
                        
                        // 연결선 업데이트
                        svg.selectAll("line.connection-line")
                            .data(getUnsatisfiedConnections(adjacencyMap))
                            .attr("x1", d => sites.find(s => s.room && s.room.id === d.from).x)
                            .attr("y1", d => sites.find(s => s.room && s.room.id === d.from).y)
                            .attr("x2", d => sites.find(s => s.room && s.room.id === d.to).x)
                            .attr("y2", d => sites.find(s => s.room && s.room.id === d.to).y);
                        
                        updateStatus(connectionStatus);
                    }
                }
            }
            repulsionAnimationId = requestAnimationFrame(repulsionStep);
        }
        
        // 자동 최적화 함수들
        function calculateScore() {
            const adjacencyMap = getAdjacencyMap();
            let totalSatisfied = 0;
            
            rooms.forEach(room => {
                const required = connections[room.id] || [];
                const adjacent = adjacencyMap[room.id] || [];
                totalSatisfied += required.filter(reqId => adjacent.includes(reqId)).length;
            });
            
            return totalSatisfied / 2; // 양방향 연결이므로 2로 나눔
        }
        
        function startOptimization() {
            if (optimizationRunning) return;
            
            optimizationRunning = true;
            optimizationStep = 0;
            bestScore = calculateScore();
            damping = parseFloat(document.getElementById('damping').value) / 100;
            
            // 모든 노드의 속도 초기화
            sites.forEach(site => {
                if (!site.isFixed) {
                    site.vx = 0;
                    site.vy = 0;
                }
            });
            
            document.getElementById('optimize-start').disabled = true;
            document.getElementById('optimize-stop').disabled = false;
            
            optimizeStep();
        }
        
        function stopOptimization() {
            optimizationRunning = false;
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            
            document.getElementById('optimize-start').disabled = false;
            document.getElementById('optimize-stop').disabled = true;
            
            // 상태 업데이트
            const adjacencyMap = getAdjacencyMap();
            const connectionStatus = checkConnections(adjacencyMap);
            updateStatus(connectionStatus);
        }
        
        function optimizeStep() {
            if (!optimizationRunning || !sites.length) {
                stopOptimization();
                return;
            }
            
            optimizationStep++;
            
            // Force-directed 레이아웃 알고리즘
            const forces = calculateForces();
            updateVelocitiesAndPositions(forces);
            
            // 점수 계산 및 완료 확인
            const currentScore = calculateScore();
            if (currentScore > bestScore) {
                bestScore = currentScore;
            }
            
            // 모든 연결이 만족되면 최적화 완료
            if (currentScore === totalRequired) {
                console.log(`최적화 완료! 모든 연결이 만족되었습니다. (${optimizationStep} 스텝)`);
                stopOptimization();
                return;
            }
            
            // 시스템이 안정화되었는지 확인 (운동 에너지가 충분히 낮은지)
            if (totalKineticEnergy < 0.01 && optimizationStep > 100) {
                console.log(`시스템이 안정화되었습니다. (${optimizationStep} 스텝, 점수: ${currentScore}/${totalRequired})`);
                stopOptimization();
                return;
            }
            
            // 다음 프레임 예약
            animationId = requestAnimationFrame(optimizeStep);
        }
        
        function calculateForces() {
            const forces = sites.map(() => ({ fx: 0, fy: 0 }));
            const adjacencyMap = getAdjacencyMap();
            
            // 1. 척력 계산 (모든 노드 간)
            for (let i = 0; i < sites.length; i++) {
                if (sites[i].isFixed) continue;
                
                for (let j = i + 1; j < sites.length; j++) {
                    const dx = sites[j].x - sites[i].x;
                    const dy = sites[j].y - sites[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist > 0 && dist < 200) {
                        // 쿨롱의 법칙: F = k * q1 * q2 / r^2
                        const repulsionMagnitude = (repulsionForce * 10) / (dist * dist);
                        const fx = (dx / dist) * repulsionMagnitude;
                        const fy = (dy / dist) * repulsionMagnitude;
                        
                        if (!sites[i].isFixed) {
                            forces[i].fx -= fx;
                            forces[i].fy -= fy;
                        }
                        if (!sites[j].isFixed) {
                            forces[j].fx += fx;
                            forces[j].fy += fy;
                        }
                    }
                }
            }
            
            // 2. 인력 계산 (연결되어야 하는 노드 간)
            rooms.forEach(room => {
                const siteIdx = sites.findIndex(s => s.room && s.room.id === room.id);
                if (siteIdx === -1 || sites[siteIdx].isFixed) return;
                
                const required = connections[room.id] || [];
                const adjacent = adjacencyMap[room.id] || [];
                
                required.forEach(targetId => {
                    const targetIdx = sites.findIndex(s => s.room && s.room.id === targetId);
                    if (targetIdx === -1) return;
                    
                    const dx = sites[targetIdx].x - sites[siteIdx].x;
                    const dy = sites[targetIdx].y - sites[siteIdx].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist > 0) {
                        // 후크의 법칙: F = k * x
                        // 연결되지 않은 경우 더 강한 인력
                        const isConnected = adjacent.includes(targetId);
                        const springConstant = isConnected ? attractionForce * 0.1 : attractionForce * 0.5;
                        const attractionMagnitude = springConstant * dist / 100;
                        
                        const fx = (dx / dist) * attractionMagnitude;
                        const fy = (dy / dist) * attractionMagnitude;
                        
                        if (!sites[siteIdx].isFixed) {
                            forces[siteIdx].fx += fx;
                            forces[siteIdx].fy += fy;
                        }
                        if (!sites[targetIdx].isFixed) {
                            forces[targetIdx].fx -= fx;
                            forces[targetIdx].fy -= fy;
                        }
                    }
                });
            });
            
            // 3. 경계로부터의 반발력 (경계 근처의 노드를 안쪽으로 밀어냄)
            sites.forEach((site, i) => {
                if (site.isFixed) return;
                
                // 경계까지의 최소 거리 계산 (간단한 근사)
                const bounds = {
                    minX: Math.min(...boundary.map(p => p[0])),
                    maxX: Math.max(...boundary.map(p => p[0])),
                    minY: Math.min(...boundary.map(p => p[1])),
                    maxY: Math.max(...boundary.map(p => p[1]))
                };
                
                const margin = 30;
                if (site.x < bounds.minX + margin) {
                    forces[i].fx += (bounds.minX + margin - site.x) * 0.5;
                }
                if (site.x > bounds.maxX - margin) {
                    forces[i].fx -= (site.x - bounds.maxX + margin) * 0.5;
                }
                if (site.y < bounds.minY + margin) {
                    forces[i].fy += (bounds.minY + margin - site.y) * 0.5;
                }
                if (site.y > bounds.maxY - margin) {
                    forces[i].fy -= (site.y - bounds.maxY + margin) * 0.5;
                }
            });
            
            return forces;
        }
        
        function updateVelocitiesAndPositions(forces) {
            totalKineticEnergy = 0;
            const dt = 0.1; // 시간 간격
            
            sites.forEach((site, i) => {
                if (site.isFixed) return;
                
                // 가속도 = 힘 / 질량 (질량 = 1)
                const ax = forces[i].fx;
                const ay = forces[i].fy;
                
                // 속도 업데이트
                site.vx += ax * dt;
                site.vy += ay * dt;
                
                // 감쇠 적용
                site.vx *= damping;
                site.vy *= damping;
                
                // 속도 제한
                const maxVelocity = 50;
                const velocity = Math.sqrt(site.vx * site.vx + site.vy * site.vy);
                if (velocity > maxVelocity) {
                    site.vx = (site.vx / velocity) * maxVelocity;
                    site.vy = (site.vy / velocity) * maxVelocity;
                }
                
                // 새 위치 계산
                const newX = site.x + site.vx * dt;
                const newY = site.y + site.vy * dt;
                
                // 경계 내부인지 확인
                if (isPointInPolygon([newX, newY], boundary)) {
                    site.x = newX;
                    site.y = newY;
                } else {
                    // 경계에 부딪히면 속도 반전
                    site.vx *= -0.5;
                    site.vy *= -0.5;
                }
                
                // 운동 에너지 계산
                totalKineticEnergy += 0.5 * (site.vx * site.vx + site.vy * site.vy);
            });
        }
        
        function applyRepulsion() {
            const repulsionRadius = 80; // 척력이 작용하는 최대 거리
            
            // 모든 노드에 대해 척력 적용 (고정된 노드 제외)
            sites.forEach((site1, i) => {
                if (site1.isFixed) return; // 고정된 노드는 움직이지 않음
                
                let fx = 0, fy = 0;
                
                sites.forEach((site2, j) => {
                    if (i !== j) {
                        const dx = site1.x - site2.x;
                        const dy = site1.y - site2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (dist > 0 && dist < repulsionRadius) {
                            const force = (repulsionForce / 1000) * (1 - dist / repulsionRadius);
                            fx += (dx / dist) * force;
                            fy += (dy / dist) * force;
                        }
                    }
                });
                
                // 새 위치가 경계 내부인지 확인
                const newX = site1.x + fx * 0.1;
                const newY = site1.y + fy * 0.1;
                
                if (isPointInPolygon([newX, newY], boundary)) {
                    site1.x = newX;
                    site1.y = newY;
                }
            });
        }
    </script>
</body>
</html>
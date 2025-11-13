import React, { useState, useEffect, useRef } from 'react';
import { Upload, RotateCcw, Building2, Eye, EyeOff } from 'lucide-react';

const FloorPlanVisualizer = () => {
  const [data, setData] = useState(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 300, height: 200 });
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [isPanning, setIsPanning] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [roomOpacity, setRoomOpacity] = useState(0.3);
  const [wallOpacity, setWallOpacity] = useState(1);
  const [showRoomLabels, setShowRoomLabels] = useState(true);
  const [showWallLabels, setShowWallLabels] = useState(true);
  const [hoveredWallId, setHoveredWallId] = useState(null);
  const svgRef = useRef(null);
  const fileInputRef = useRef(null);

  const calculateInitialViewBox = (jsonData) => {
    if (!jsonData || !jsonData.wallSegments || jsonData.wallSegments.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Wall segments의 좌표 고려
    jsonData.wallSegments.forEach(segment => {
      minX = Math.min(minX, segment.start[0], segment.end[0]);
      minY = Math.min(minY, segment.start[1], segment.end[1]);
      maxX = Math.max(maxX, segment.start[0], segment.end[0]);
      maxY = Math.max(maxY, segment.start[1], segment.end[1]);
    });
    
    const padding = 100;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    
    setViewBox({
      x: minX - padding,
      y: minY - padding,
      width: width,
      height: height
    });
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);
          setData(jsonData);
          calculateInitialViewBox(jsonData);
          // Set initial floor to 'all' or first available floor
          if (jsonData.metadata && jsonData.metadata.floors && jsonData.metadata.floors.length > 0) {
            setSelectedFloor('all');
          }
        } catch (error) {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 1.1 : 0.9;
    
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    
    const newWidth = viewBox.width * scaleFactor;
    const newHeight = viewBox.height * scaleFactor;
    const newX = svgP.x - (svgP.x - viewBox.x) * scaleFactor;
    const newY = svgP.y - (svgP.y - viewBox.y) * scaleFactor;
    
    setViewBox({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    });
  };

  const handleMouseDown = (e) => {
    setIsPanning(true);
    setStartPoint({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    
    const dx = (e.clientX - startPoint.x) * viewBox.width / svgRef.current.clientWidth;
    const dy = (e.clientY - startPoint.y) * viewBox.height / svgRef.current.clientHeight;
    
    setViewBox({
      ...viewBox,
      x: viewBox.x - dx,
      y: viewBox.y - dy
    });
    
    setStartPoint({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const resetView = () => {
    calculateInitialViewBox(data);
  };

  const getWallColor = (segment) => {
    // Subdivision walls - 보라색
    if (segment.subtype === 'subdivision') {
      return '#8b5cf6'; // Purple
    }
    
    switch (segment.type) {
      case 'exterior':
        return '#ef4444'; // Red
      case 'interior':
        return '#3b82f6'; // Blue
      case 'intersection':
        return '#10b981'; // Green
      default:
        return '#6b7280'; // Gray
    }
  };

  const getRoomPath = (room) => {
    const { center, width, height, rotation } = room;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Convert rotation from degrees to radians
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // Calculate corners
    const corners = [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight]
    ].map(([x, y]) => {
      // Rotate point
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;
      // Translate to center
      return [center[0] + rotatedX, center[1] + rotatedY];
    });
    
    // Create SVG path
    return `M ${corners[0][0]} ${corners[0][1]} L ${corners[1][0]} ${corners[1][1]} L ${corners[2][0]} ${corners[2][1]} L ${corners[3][0]} ${corners[3][1]} Z`;
  };

  const getFilteredRooms = () => {
    if (!data || !data.rooms) return [];
    if (selectedFloor === 'all') return data.rooms;
    
    // 모든 room에 floor 속성이 있으므로 직접 필터링
    return data.rooms.filter(room => room.floor === selectedFloor);
  };

  const getFilteredWalls = () => {
    if (!data || !data.wallSegments) return [];
    if (selectedFloor === 'all') return data.wallSegments;
    
    // 모든 wall에 floor 속성이 있으므로 직접 필터링
    return data.wallSegments.filter(wall => wall.floor === selectedFloor);
  };

  const getStats = () => {
    const filteredRooms = getFilteredRooms();
    const filteredWalls = getFilteredWalls();
    
    const stats = {
      rooms: filteredRooms.length,
      walls: filteredWalls.length,
      exterior: filteredWalls.filter(w => w.type === 'exterior').length,
      interior: filteredWalls.filter(w => w.type === 'interior').length,
      intersection: filteredWalls.filter(w => w.type === 'intersection').length
    };
    
    return stats;
  };

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Upload className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No Data Loaded</h2>
        <p className="text-gray-500 mb-4">Please upload a floor plan JSON file to visualize</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Upload JSON File
        </button>
      </div>
    </div>
  );

  const stats = getStats();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-800 p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-semibold text-white">Floor Plan Visualizer</h1>
                {/* Floor selector */}
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-gray-300" />
                  <select
                    value={selectedFloor}
                    onChange={(e) => setSelectedFloor(e.target.value)}
                    className="px-3 py-1 bg-gray-700 text-white rounded text-sm"
                  >
                    <option value="all">All Floors</option>
                    {data?.metadata?.floors?.map(floor => (
                      <option key={floor} value={floor}>{floor}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 items-center">
                {/* Room opacity */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white">Room Fill:</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={roomOpacity} 
                    onChange={(e) => setRoomOpacity(parseFloat(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-white w-10">{(roomOpacity * 100).toFixed(0)}%</span>
                </div>
                {/* Wall opacity */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white">Walls:</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={wallOpacity} 
                    onChange={(e) => setWallOpacity(parseFloat(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-white w-10">{(wallOpacity * 100).toFixed(0)}%</span>
                </div>
                {/* Toggle buttons */}
                <button
                  onClick={() => setShowRoomLabels(!showRoomLabels)}
                  className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${
                    showRoomLabels ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}
                >
                  {showRoomLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  Room Labels
                </button>
                <button
                  onClick={() => setShowWallLabels(!showWallLabels)}
                  className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${
                    showWallLabels ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}
                >
                  {showWallLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  Wall Labels
                </button>
                <button
                  onClick={resetView}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset View
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" />
                  Upload JSON
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-4 p-4 bg-gray-100">
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-gray-800">{stats.rooms}</div>
              <div className="text-sm text-gray-600">Rooms</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-gray-800">{stats.walls}</div>
              <div className="text-sm text-gray-600">Total Walls</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-red-600">{stats.exterior}</div>
              <div className="text-sm text-gray-600">Exterior Walls</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-blue-600">{stats.interior}</div>
              <div className="text-sm text-gray-600">Interior Walls</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-green-600">{stats.intersection}</div>
              <div className="text-sm text-gray-600">Intersections</div>
            </div>
          </div>

          {/* Main Visualization */}
          <div className="p-4">
            <div className="bg-gray-100 rounded border border-gray-200 overflow-hidden">
              <svg 
                ref={svgRef}
                width="100%"
                height="600"
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                className="bg-white"
              >
                {/* Grid Pattern */}
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="400%" height="400%" x="-200%" y="-200%" fill="url(#grid)" />
                
                {/* Rooms */}
                {getFilteredRooms().map((room) => {
                  const path = getRoomPath(room);
                  
                  // 층별로 다른 색상 적용
                  const fillColor = room.floor === 'B1' ? 'rgba(239, 68, 68,' : 
                                   room.floor === 'F1' ? 'rgba(59, 130, 246,' :
                                   room.floor === 'F2' ? 'rgba(16, 185, 129,' : 
                                   'rgba(229, 231, 235,';
                  
                  return (
                    <g key={room.id}>
                      <path
                        d={path}
                        fill={`${fillColor} ${roomOpacity})`}
                        stroke="#9ca3af"
                        strokeWidth="1"
                        strokeDasharray="5 3"
                      />
                      {showRoomLabels && (
                        <>
                          <rect
                            x={room.center[0] - 50}
                            y={room.center[1] - 15}
                            width="100"
                            height="30"
                            fill="white"
                            stroke="#9ca3af"
                            strokeWidth="0.5"
                            rx="2"
                          />
                          <text
                            x={room.center[0]}
                            y={room.center[1] - 3}
                            fontSize="11"
                            fontWeight="bold"
                            fill="#1f2937"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {room.name}
                          </text>
                          <text
                            x={room.center[0]}
                            y={room.center[1] + 9}
                            fontSize="9"
                            fill="#6b7280"
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {room.floor || 'N/A'} | {room.area}㎡
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
                
                {/* Wall Segments - 순서대로 그리기: interior -> exterior -> intersection */}
                {getFilteredWalls()
                  .sort((a, b) => {
                    // 그리는 순서 정의 (숫자가 작을수록 먼저 그림)
                    const order = {
                      'interior': 1,      // 가장 아래 (먼저 그림)
                      'exterior': 2,      // 중간
                      'intersection': 3   // 가장 위 (나중에 그림)
                    };
                    return (order[a.type] || 0) - (order[b.type] || 0);
                  })
                  .map((segment) => {
                  const isHovered = hoveredWallId === segment.id;
                  const strokeWidth = isHovered ? 4 : 2.5;
                  const midX = (segment.start[0] + segment.end[0]) / 2;
                  const midY = (segment.start[1] + segment.end[1]) / 2;
                  
                  return (
                    <g key={segment.id} opacity={wallOpacity}>
                      <line
                        x1={segment.start[0]}
                        y1={segment.start[1]}
                        x2={segment.end[0]}
                        y2={segment.end[1]}
                        stroke={getWallColor(segment)}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        onMouseEnter={() => setHoveredWallId(segment.id)}
                        onMouseLeave={() => setHoveredWallId(null)}
                        style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease' }}
                      />
                      {showWallLabels && (
                        <>
                          <text
                            x={midX}
                            y={midY - 6}
                            fontSize={isHovered ? "10" : "8"}
                            fill={isHovered ? "#000000" : "#1f2937"}
                            stroke="white"
                            strokeWidth={isHovered ? "2" : "1.5"}
                            paintOrder="stroke"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="font-mono font-semibold"
                            onMouseEnter={() => setHoveredWallId(segment.id)}
                            onMouseLeave={() => setHoveredWallId(null)}
                            style={{ cursor: 'pointer', transition: 'font-size 0.2s ease' }}
                          >
                            {segment.id}
                          </text>
                          <text
                            x={midX}
                            y={midY + 5}
                            fontSize={isHovered ? "9" : "7"}
                            fill={isHovered ? "#374151" : "#6b7280"}
                            stroke="white"
                            strokeWidth={isHovered ? "1.5" : "1"}
                            paintOrder="stroke"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="font-mono"
                            onMouseEnter={() => setHoveredWallId(segment.id)}
                            onMouseLeave={() => setHoveredWallId(null)}
                            style={{ cursor: 'pointer', transition: 'font-size 0.2s ease' }}
                          >
                            {segment.length.toFixed(1)} | {segment.floor || 'N/A'}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend & Info */}
            <div className="mt-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Wall Types:</div>
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-red-500 rounded"></div>
                      <span className="text-gray-600">Exterior</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-blue-500 rounded"></div>
                      <span className="text-gray-600">Interior</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-green-500 rounded"></div>
                      <span className="text-gray-600">Intersection</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-purple-500 rounded"></div>
                      <span className="text-gray-600">Subdivision</span>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-700 mt-3 mb-2">Room Colors by Floor:</div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-400 opacity-50 rounded"></div>
                      <span className="text-gray-600">B1</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-400 opacity-50 rounded"></div>
                      <span className="text-gray-600">F1</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-400 opacity-50 rounded"></div>
                      <span className="text-gray-600">F2</span>
                    </div>
                  </div>
                </div>
                <div className="text-gray-500 text-sm text-right">
                  <div>Mouse wheel: Zoom | Drag: Pan | Hover: Highlight walls</div>
                  <div className="mt-1">Currently viewing: <span className="font-semibold">{selectedFloor === 'all' ? 'All Floors' : selectedFloor}</span></div>
                  <div className="mt-2 text-xs">
                    디버그: 선택된 층 = {selectedFloor}, 
                    전체 방 = {data?.rooms?.length || 0}, 
                    필터된 방 = {getFilteredRooms().length},
                    전체 벽 = {data?.wallSegments?.length || 0},
                    필터된 벽 = {getFilteredWalls().length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloorPlanVisualizer;
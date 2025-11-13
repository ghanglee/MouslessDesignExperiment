import React, { useState, useEffect, useRef } from 'react';
import { Upload, RotateCcw } from 'lucide-react';

const WallSegmentVisualizer = () => {
  const [data, setData] = useState(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 300, height: 200 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [roomOpacity, setRoomOpacity] = useState(1);
  const [trimmedWallOpacity, setTrimmedWallOpacity] = useState(0.5);
  const [interiorCircleOpacity, setInteriorCircleOpacity] = useState(0.5);
  const [hoveredWallId, setHoveredWallId] = useState(null);
  const svgRef = useRef(null);
  const fileInputRef = useRef(null);

  const calculateInitialViewBox = (jsonData) => {
    if (!jsonData || !jsonData.wallSegments || jsonData.wallSegments.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Wall segments의 좌표 고려
    jsonData.wallSegments.forEach(segment => {
      if (segment.isArc) {
        minX = Math.min(minX, segment.center[0] - segment.radius);
        minY = Math.min(minY, segment.center[1] - segment.radius);
        maxX = Math.max(maxX, segment.center[0] + segment.radius);
        maxY = Math.max(maxY, segment.center[1] + segment.radius);
      } else if (segment.start && segment.end) {
        minX = Math.min(minX, segment.start[0], segment.end[0]);
        minY = Math.min(minY, segment.start[1], segment.end[1]);
        maxX = Math.max(maxX, segment.start[0], segment.end[0]);
        maxY = Math.max(maxY, segment.start[1], segment.end[1]);
      }
    });
    
    // 원형 방들의 범위도 고려
    jsonData.rooms.forEach(room => {
      if (room.shape === 'circle') {
        const radius = room.radius;
        minX = Math.min(minX, room.center[0] - radius);
        minY = Math.min(minY, room.center[1] - radius);
        maxX = Math.max(maxX, room.center[0] + radius);
        maxY = Math.max(maxY, room.center[1] + radius);
      }
    });
    
    const padding = 30;
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

  const getRoomCenter = (roomId) => {
    // Find the room data
    const room = data.rooms.find(r => r.id === roomId);
    
    // If it's a circular room, use its center directly
    if (room && room.shape === 'circle') {
      return room.center;
    }
    
    // For rectangular rooms with center property, use it
    if (room && room.center) {
      return room.center;
    }
    
    // For rectangular rooms, calculate center from wall segments
    const roomSegments = data.wallSegments.filter(seg => seg.rooms.includes(roomId));
    if (roomSegments.length === 0) return [0, 0];
    
    let sumX = 0, sumY = 0, count = 0;
    roomSegments.forEach(seg => {
      sumX += seg.start[0] + seg.end[0];
      sumY += seg.start[1] + seg.end[1];
      count += 2;
    });
    
    return [sumX / count, sumY / count];
  };

  const createArcPath = (segment) => {
    const { center, radius, startPoint, endPoint, startAngle, endAngle } = segment;
    
    // Normalize angles to 0-2π range
    const normalizeAngle = (angle) => {
      const normalized = angle % (2 * Math.PI);
      return normalized < 0 ? normalized + 2 * Math.PI : normalized;
    };
    
    const start = normalizeAngle(startAngle);
    const end = normalizeAngle(endAngle);
    
    // Calculate angle difference
    let angleDiff = end - start;
    
    // If the difference is negative, we're going the long way around
    if (angleDiff < 0) {
      angleDiff += 2 * Math.PI;
    }
    
    // For angles > 2π in the original data, check if we need the long arc
    if (endAngle > 2 * Math.PI && startAngle < 2 * Math.PI) {
      angleDiff = endAngle - startAngle;
    }
    
    // Determine flags
    const largeArcFlag = angleDiff > Math.PI ? 1 : 0;
    const sweepFlag = 1; // Always clockwise for this data
    
    // Create SVG path
    return `M ${startPoint[0]} ${startPoint[1]} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endPoint[0]} ${endPoint[1]}`;
  };

  const getSegmentAngle = (segment) => {
    const dx = segment.end[0] - segment.start[0];
    const dy = segment.end[1] - segment.start[1];
    return Math.atan2(dy, dx) * 180 / Math.PI;
  };

  const getWallColor = (segment) => {
    // Trimmed walls (arc walls inside circular rooms) - gray
    if (segment.type === 'trimmed' || segment.id.startsWith('TW')) {
      return '#9ca3af'; // Gray-400
    }
    
    // Interior walls with adjacency types 1-6
    if (segment.type === 'interior') {
      const adjacencyColors = {
        1: '#3b82f6', // Blue
        2: '#10b981', // Emerald
        3: '#8b5cf6', // Violet
        4: '#f59e0b', // Amber
        5: '#ec4899', // Pink
        6: '#14b8a6'  // Teal
      };
      return adjacencyColors[segment.adjacencyType] || '#6b7280'; // Default gray
    }
    
    // Normal interior walls
    if (segment.type === 'interior_normal') {
      return '#6b7280'; // Gray
    }
    
    // Interior circle walls
    if (segment.type === 'interior_circle') {
      return '#60a5fa'; // Blue-400
    }
    
    // Exterior walls
    if (segment.type === 'exterior') {
      return '#ef4444'; // Red
    }
    
    // Shared exterior walls
    if (segment.type === 'shared_exterior') {
      return '#f97316'; // Orange
    }
    
    return '#6b7280'; // Default gray
  };

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Upload className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No Data Loaded</h2>
        <p className="text-gray-500 mb-4">Please upload a JSON file to visualize wall segments</p>
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-800 p-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-semibold text-white">Wall Segments Visualizer</h1>
              <div className="flex gap-3 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white">Room Opacity:</label>
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
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white">TW Opacity:</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={trimmedWallOpacity} 
                    onChange={(e) => setTrimmedWallOpacity(parseFloat(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-white w-10">{(trimmedWallOpacity * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-white">IC Opacity:</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={interiorCircleOpacity} 
                    onChange={(e) => setInteriorCircleOpacity(parseFloat(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-white w-10">{(interiorCircleOpacity * 100).toFixed(0)}%</span>
                </div>
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
          <div className="grid grid-cols-4 gap-4 p-4 bg-gray-100">
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-gray-800">{data.metadata.totalRooms}</div>
              <div className="text-sm text-gray-600">Total Rooms</div>
              {data.metadata.circularRooms !== undefined && (
                <div className="text-xs text-gray-500 mt-1">
                  {data.metadata.circularRooms} circular, {data.metadata.rectangularRooms} rectangular
                </div>
              )}
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-gray-800">{data.metadata.totalWallSegments}</div>
              <div className="text-sm text-gray-600">Total Walls</div>
              {data.metadata.arcSegments !== undefined && (
                <div className="text-xs text-gray-500 mt-1">
                  {data.metadata.arcSegments} arc, {data.metadata.linearSegments} linear
                </div>
              )}
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-gray-800">{data.metadata.interiorWalls}</div>
              <div className="text-sm text-gray-600">Interior Walls</div>
            </div>
            <div className="bg-white rounded p-3">
              <div className="text-2xl font-semibold text-gray-800">{data.metadata.exteriorWalls}</div>
              <div className="text-sm text-gray-600">Exterior Walls</div>
              {data.metadata.trimmedWalls !== undefined && (
                <div className="text-xs text-gray-500 mt-1">
                  {data.metadata.trimmedWalls} trimmed
                </div>
              )}
            </div>
          </div>

          {/* Main Visualization */}
          <div className="p-4">
            <div className="bg-gray-100 rounded border border-gray-200 overflow-hidden">
              <svg 
                ref={svgRef}
                width="100%"
                height="500"
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                className="bg-white"
              >
                {/* Grid Pattern and Hatch Pattern */}
                <defs>
                  <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e5e7eb" strokeWidth="0.2"/>
                  </pattern>
                  <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#9ca3af" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="300%" height="300%" x="-100%" y="-100%" fill="url(#grid)" />
                
                {/* Hatch pattern for empty spaces (placeholder) */}
                {/* Note: 실제 구현시에는 벽으로 둘러싸인 빈 공간을 계산하는 로직이 필요합니다 */}
                
                {/* Circular Rooms - 회색 점선으로 */}
                {data.rooms.filter(room => room.shape === 'circle').map((room) => {
                  const fontSize = 5;
                  const charWidth = fontSize * 0.6;
                  const estimatedWidth = room.name.length * charWidth + 8;
                  const height = fontSize * 2;
                  const radius = room.radius;
                  
                  return (
                    <g key={room.id} opacity={roomOpacity}>
                      <circle
                        cx={room.center[0]}
                        cy={room.center[1]}
                        r={radius}
                        fill="rgba(156, 163, 175, 0.1)"
                        stroke="#9ca3af"
                        strokeWidth="1"
                        strokeDasharray="5 3"
                      />
                      <rect
                        x={room.center[0] - estimatedWidth / 2}
                        y={room.center[1] - height / 2}
                        width={estimatedWidth}
                        height={height}
                        fill="white"
                        stroke="#9ca3af"
                        strokeWidth="0.5"
                        rx="1"
                      />
                      <text
                        x={room.center[0]}
                        y={room.center[1]}
                        fontSize={fontSize}
                        fontWeight="bold"
                        fill="#6b7280"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {room.name}
                      </text>
                      <text
                        x={room.center[0]}
                        y={room.center[1] + height + 3}
                        fontSize={fontSize * 0.8}
                        fill="#6b7280"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        r={radius.toFixed(1)}
                      </text>
                    </g>
                  );
                })}
                
                {/* Rectangular Room Labels */}
                {data.rooms.filter(room => room.shape !== 'circle').map((room) => {
                  const center = getRoomCenter(room.id);
                  const fontSize = 5;
                  const charWidth = fontSize * 0.6;
                  const estimatedWidth = room.name.length * charWidth + 8;
                  const height = fontSize * 2;
                  
                  return (
                    <g key={room.id} opacity={roomOpacity}>
                      <rect
                        x={center[0] - estimatedWidth / 2}
                        y={center[1] - height / 2}
                        width={estimatedWidth}
                        height={height}
                        fill="white"
                        stroke="#9ca3af"
                        strokeWidth="0.5"
                        rx="1"
                      />
                      <text
                        x={center[0]}
                        y={center[1]}
                        fontSize={fontSize}
                        fontWeight="bold"
                        fill="#111827"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {room.name}
                      </text>
                    </g>
                  );
                })}
                
                {/* Wall Segments */}
                {data.wallSegments.map((segment) => {
                  const isArc = segment.isArc === true;
                  const isTrimmed = segment.type === 'trimmed' || segment.id.startsWith('TW');
                  const isInteriorCircle = segment.type === 'interior_circle';
                  const isHovered = hoveredWallId === segment.id;
                  
                  let opacity = 1;
                  let baseStrokeWidth = 2.5;
                  
                  if (isTrimmed) {
                    opacity = trimmedWallOpacity;
                    baseStrokeWidth = 1.25; // 0.5x thinner
                  } else if (isInteriorCircle) {
                    opacity = interiorCircleOpacity;
                    baseStrokeWidth = 1.25; // 0.5x thinner
                  }
                  
                  // 호버시 2배 두께
                  const strokeWidth = isHovered ? baseStrokeWidth * 2 : baseStrokeWidth;
                  
                  const strokeDasharray = isInteriorCircle ? "5 3" : undefined; // Dashed for interior_circle
                  
                  if (isArc) {
                    // Arc segment
                    const midAngle = (segment.startAngle + segment.endAngle) / 2;
                    const labelX = segment.center[0] + segment.radius * Math.cos(midAngle);
                    const labelY = segment.center[1] + segment.radius * Math.sin(midAngle);
                    
                    return (
                      <g key={segment.id} opacity={opacity}>
                        <path
                          d={createArcPath(segment)}
                          fill="none"
                          stroke={getWallColor(segment)}
                          strokeWidth={strokeWidth}
                          strokeLinecap="round"
                          strokeDasharray={strokeDasharray}
                          onMouseEnter={() => setHoveredWallId(segment.id)}
                          onMouseLeave={() => setHoveredWallId(null)}
                          style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease' }}
                        />
                        <text
                          x={labelX}
                          y={labelY - 4}
                          fontSize={isHovered ? "8.5" : "6.75"}
                          fill={isHovered ? "#000000" : "#1f2937"}
                          stroke="white"
                          strokeWidth={isHovered ? "1" : "0.8"}
                          paintOrder="stroke"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="font-mono font-semibold"
                          onMouseEnter={() => setHoveredWallId(segment.id)}
                          onMouseLeave={() => setHoveredWallId(null)}
                          style={{ cursor: 'pointer', transition: 'font-size 0.2s ease, fill 0.2s ease' }}
                        >
                          {segment.id}
                        </text>
                        <text
                          x={labelX}
                          y={labelY + 4}
                          fontSize={isHovered ? "7.5" : "5.625"}
                          fill={isHovered ? "#374151" : "#6b7280"}
                          stroke="white"
                          strokeWidth={isHovered ? "1" : "0.8"}
                          paintOrder="stroke"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="font-mono"
                          onMouseEnter={() => setHoveredWallId(segment.id)}
                          onMouseLeave={() => setHoveredWallId(null)}
                          style={{ cursor: 'pointer', transition: 'font-size 0.2s ease, fill 0.2s ease' }}
                        >
                          {(segment.length / 10).toFixed(1)}m
                        </text>
                      </g>
                    );
                  } else {
                    // Linear segment
                    const angle = getSegmentAngle(segment);
                    const midX = (segment.start[0] + segment.end[0]) / 2;
                    const midY = (segment.start[1] + segment.end[1]) / 2;
                    
                    return (
                      <g key={segment.id} opacity={opacity}>
                        <line
                          x1={segment.start[0]}
                          y1={segment.start[1]}
                          x2={segment.end[0]}
                          y2={segment.end[1]}
                          stroke={getWallColor(segment)}
                          strokeWidth={strokeWidth}
                          strokeLinecap="round"
                          strokeDasharray={strokeDasharray}
                          onMouseEnter={() => setHoveredWallId(segment.id)}
                          onMouseLeave={() => setHoveredWallId(null)}
                          style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease' }}
                        />
                        <text
                          x={midX}
                          y={midY - 4}
                          fontSize={isHovered ? "8.5" : "6.75"}
                          fill={isHovered ? "#000000" : "#1f2937"}
                          stroke="white"
                          strokeWidth={isHovered ? "1" : "0.8"}
                          paintOrder="stroke"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="font-mono font-semibold"
                          onMouseEnter={() => setHoveredWallId(segment.id)}
                          onMouseLeave={() => setHoveredWallId(null)}
                          style={{ cursor: 'pointer', transition: 'font-size 0.2s ease, fill 0.2s ease' }}
                        >
                          {segment.id}
                        </text>
                        <text
                          x={midX}
                          y={midY + 4}
                          fontSize={isHovered ? "7.5" : "5.625"}
                          fill={isHovered ? "#374151" : "#6b7280"}
                          stroke="white"
                          strokeWidth={isHovered ? "1" : "0.8"}
                          paintOrder="stroke"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="font-mono"
                          onMouseEnter={() => setHoveredWallId(segment.id)}
                          onMouseLeave={() => setHoveredWallId(null)}
                          style={{ cursor: 'pointer', transition: 'font-size 0.2s ease, fill 0.2s ease' }}
                        >
                          {(segment.length / 10).toFixed(1)}m
                        </text>
                      </g>
                    );
                  }
                })}
              </svg>
            </div>

            {/* Legend & Controls */}
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
                      <div className="w-4 h-0.5 bg-gray-400 rounded"></div>
                      <span className="text-gray-600">Trimmed (TW)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-gray-500 rounded"></div>
                      <span className="text-gray-600">Normal Interior</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-blue-400 rounded"></div>
                      <span className="text-gray-600">Interior Circle</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-blue-500 rounded"></div>
                      <span className="text-gray-600">Interior Type 1</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-emerald-500 rounded"></div>
                      <span className="text-gray-600">Interior Type 2</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-violet-500 rounded"></div>
                      <span className="text-gray-600">Interior Type 3</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-amber-500 rounded"></div>
                      <span className="text-gray-600">Interior Type 4</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-pink-500 rounded"></div>
                      <span className="text-gray-600">Interior Type 5</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-1 bg-teal-500 rounded"></div>
                      <span className="text-gray-600">Interior Type 6</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 fill-gray-300" style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, #9ca3af 3px, #9ca3af 4px)' }}></div>
                      <span className="text-gray-600">Empty Space</span>
                    </div>
                  </div>
                </div>
                <div className="text-gray-500 text-sm">
                  Mouse wheel: Zoom | Drag: Pan | Hover: Highlight
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WallSegmentVisualizer;
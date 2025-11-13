import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import Papa from 'papaparse';
import _ from 'lodash';

// Constants
const SCALE_FACTOR = 10;
const MIN_SIZE = 20;
const EDGE_TOLERANCE = 3; // 2에서 3으로 증가
const MIN_GRID_SPACING = 0.5;
const AREA_TOLERANCE = 0.05;

// Memoized components
const RoomStats = React.memo(({ stats, connectionSatisfaction }) => {
  return (
    <div className="mb-6 p-4 bg-blue-50 rounded">
      <h3 className="font-semibold mb-2">통계 정보</h3>
      <div className="text-sm space-y-1">
        <p>총 실 개수: {stats.totalRooms || 0}</p>
        <p>총 연결 수: {stats.totalConnections || 0}</p>
        <p>총 면적: {stats.totalArea || 0}㎡</p>
        <p>평균 연결 수: {stats.avgConnections || 0}</p>
        {Object.keys(connectionSatisfaction).length > 0 && (
          <p>평균 연결 만족도: {
            (Object.values(connectionSatisfaction).reduce((a, b) => a + b, 0) / 
             Object.keys(connectionSatisfaction).length * 100).toFixed(1)
          }%</p>
        )}
      </div>
    </div>
  );
});

const OptimizationProgress = React.memo(({ progress, phase, mode }) => {
  return (
    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
      <h3 className="font-semibold mb-2">최적화 진행 중...</h3>
      <div className="text-sm space-y-2">
        <p>반복: {progress.iteration}회</p>
        <p>현재 만족도: {progress.satisfaction.toFixed(1)}%</p>
        {mode === 'smart' && phase > 0 && (
          <p className="text-xs text-gray-600">
            현재 단계: {phase === 1 ? '전역 배치' : 
                      phase === 2 ? '겹침 해결' : '미세 조정'}
          </p>
        )}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress.satisfaction}%` }}
          />
        </div>
      </div>
    </div>
  );
});

const AdjustmentWarnings = React.memo(({ warnings }) => {
  return (
    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
      <h3 className="font-semibold mb-2 text-red-800">⚠️ 면적 조정 경고</h3>
      <p className="text-xs text-red-600 mb-2">
        다음 방들의 면적 변화가 ±5%를 초과합니다:
      </p>
      <ul className="text-xs space-y-1">
        {warnings.map(warning => (
          <li key={warning.id} className="text-red-700">
            • {warning.name}: {warning.originalArea.toFixed(1)}㎡ → {warning.newArea.toFixed(1)}㎡ 
            ({(warning.areaChange * 100).toFixed(1)}% 변화)
          </li>
        ))}
      </ul>
    </div>
  );
});

export default function ForceDirectedFloorPlanner() {
  const [rooms, setRooms] = useState([]);
  const [links, setLinks] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState('Floor 1(F1)');
  const [boundary, setBoundary] = useState(null);
  const [showConnections, setShowConnections] = useState(false);
  const [pinnedRooms, setPinnedRooms] = useState(new Set());
  const [stats, setStats] = useState({});
  const [connectionSatisfaction, setConnectionSatisfaction] = useState({});
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDimensionEdit, setShowDimensionEdit] = useState(false);
  const [editingDimension, setEditingDimension] = useState({ width: '', height: '' });
  const [gridSpacing, setGridSpacing] = useState(1.0);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const [gridBounds, setGridBounds] = useState(null);
  const [snapRoomSizes, setSnapRoomSizes] = useState(false);
  const [originalRoomSizes, setOriginalRoomSizes] = useState(new Map());
  const [adjustmentWarnings, setAdjustmentWarnings] = useState([]);
  const [linkStrength, setLinkStrength] = useState(0.8);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState({ iteration: 0, satisfaction: 0 });
  const [optimizationCancel, setOptimizationCancel] = useState(false);
  const [optimizationMode, setOptimizationMode] = useState('smart');
  const [optimizationPhase, setOptimizationPhase] = useState(0);
  
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const fileInputRef = useRef(null);
  const matrixFileRef = useRef(null);
  const roomFileRef = useRef(null);
  const optimizationCancelRef = useRef(false);

  // Memoized color scale
  const colorScale = useMemo(() => 
    d3.scaleOrdinal()
      .domain(['Service(SV)', 'Equipment(EQ)', 'Common(CM)', 'Game(GM)', 'Playground(PL)'])
      .range(['#ff7f0e', '#2ca02c', '#1f77b4', '#d62728', '#9467bd'])
  , []);

  // Memoized satisfaction color function
  const getSatisfactionColor = useCallback((satisfaction) => {
    if (satisfaction === 1) return "#90EE90";
    if (satisfaction >= 0.5) return "#FFEB3B";
    return "#FF6B6B";
  }, []);

  // Calculate grid bounds from GeoJSON boundary
  const calculateGridBounds = useCallback((boundary) => {
    if (!boundary || !Array.isArray(boundary) || boundary.length === 0) return null;
    
    const bounds = boundary.reduce((acc, point) => {
      const x = point[0] * SCALE_FACTOR;
      const y = point[1] * SCALE_FACTOR;
      return {
        minX: Math.min(acc.minX, x),
        minY: Math.min(acc.minY, y),
        maxX: Math.max(acc.maxX, x),
        maxY: Math.max(acc.maxY, y)
      };
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    
    return bounds;
  }, []);

  // Snap position to grid
  const snapToGrid = useCallback((x, y, width, height, useEdgeSnap = true) => {
    if (!gridBounds || !snapToGridEnabled) return { x, y };
    
    const gridSizePixels = gridSpacing * SCALE_FACTOR;
    
    if (useEdgeSnap && width && height) {
      const leftEdge = x - width / 2;
      const topEdge = y - height / 2;
      
      const snappedLeft = Math.round((leftEdge - gridBounds.minX) / gridSizePixels) * gridSizePixels + gridBounds.minX;
      const snappedTop = Math.round((topEdge - gridBounds.minY) / gridSizePixels) * gridSizePixels + gridBounds.minY;
      
      return {
        x: snappedLeft + width / 2,
        y: snappedTop + height / 2
      };
    } else {
      const snappedX = Math.round((x - gridBounds.minX) / gridSizePixels) * gridSizePixels + gridBounds.minX;
      const snappedY = Math.round((y - gridBounds.minY) / gridSizePixels) * gridSizePixels + gridBounds.minY;
      
      return { x: snappedX, y: snappedY };
    }
  }, [gridBounds, gridSpacing, snapToGridEnabled]);

  // Adjust room size to grid - Optimized version
  const adjustRoomToGrid = useCallback((room, gridSpacing) => {
    const gridSize = gridSpacing * SCALE_FACTOR;
    const originalArea = room.area;
    const originalWidth = room.width / SCALE_FACTOR;
    const originalHeight = room.height / SCALE_FACTOR;
    
    const widthCeil = Math.ceil(originalWidth / gridSpacing);
    const widthFloor = Math.floor(originalWidth / gridSpacing);
    const heightCeil = Math.ceil(originalHeight / gridSpacing);
    const heightFloor = Math.floor(originalHeight / gridSpacing);
    
    const combinations = [
      { w: widthCeil, h: heightCeil },
      { w: widthCeil, h: heightFloor },
      { w: widthFloor, h: heightCeil },
      { w: widthFloor, h: heightFloor }
    ];
    
    const result = combinations.reduce((best, combo) => {
      const width = Math.max(combo.w, 1) * gridSpacing;
      const height = Math.max(combo.h, 1) * gridSpacing;
      const newArea = width * height;
      const areaDiff = Math.abs(newArea - originalArea) / originalArea;
      
      if (areaDiff <= AREA_TOLERANCE && areaDiff < best.areaDiff) {
        return { width, height, meetsRequirement: true, areaChange: areaDiff, areaDiff };
      } else if (!best.meetsRequirement && areaDiff < best.areaDiff) {
        return { width, height, meetsRequirement: false, areaChange: areaDiff, areaDiff };
      }
      return best;
    }, { width: gridSpacing, height: gridSpacing, meetsRequirement: false, areaChange: 1, areaDiff: Infinity });
    
    return {
      width: result.width * SCALE_FACTOR,
      height: result.height * SCALE_FACTOR,
      meetsRequirement: result.meetsRequirement,
      areaChange: result.areaChange
    };
  }, []);

  // Update grid bounds when boundary changes
  useEffect(() => {
    if (boundary) {
      const bounds = calculateGridBounds(boundary);
      setGridBounds(bounds);
    } else {
      setGridBounds(null);
    }
  }, [boundary, calculateGridBounds]);

  // Handle snap room sizes toggle - 개선된 버전
  useEffect(() => {
    if (!rooms.length || !simulationRef.current) return;
    
    if (snapRoomSizes && gridSpacing > 0) {
      // 원본 크기 저장
      if (originalRoomSizes.size === 0) {
        const sizeMap = new Map();
        rooms.forEach(room => {
          sizeMap.set(room.id, { width: room.width, height: room.height, area: room.area });
        });
        setOriginalRoomSizes(sizeMap);
      }
      
      const warnings = [];
      
      // rooms 배열 복사본 생성
      const updatedRooms = rooms.map(room => {
        const adjustment = adjustRoomToGrid(room, gridSpacing);
        
        if (!adjustment.meetsRequirement) {
          warnings.push({
            id: room.id,
            name: room.name,
            originalArea: room.area,
            newArea: (adjustment.width * adjustment.height) / (SCALE_FACTOR * SCALE_FACTOR),
            areaChange: adjustment.areaChange
          });
        }
        
        // 기존 room 객체의 참조를 유지하면서 속성만 변경
        const updatedRoom = Object.assign(room, {
          width: adjustment.width,
          height: adjustment.height,
          gridAdjusted: true,
          meetsAreaRequirement: adjustment.meetsRequirement
        });
        
        return updatedRoom;
      });
      
      setAdjustmentWarnings(warnings);
      
      // simulation의 nodes를 업데이트
      simulationRef.current.nodes(updatedRooms);
      simulationRef.current.alpha(0.3).restart();
      
    } else if (!snapRoomSizes && originalRoomSizes.size > 0) {
      // 원래 크기로 복원
      const updatedRooms = rooms.map(room => {
        const original = originalRoomSizes.get(room.id);
        if (original) {
          Object.assign(room, {
            width: original.width,
            height: original.height,
            gridAdjusted: false,
            meetsAreaRequirement: true
          });
        }
        return room;
      });
      
      setAdjustmentWarnings([]);
      setOriginalRoomSizes(new Map());
      
      // simulation의 nodes를 업데이트
      simulationRef.current.nodes(updatedRooms);
      simulationRef.current.alpha(0.3).restart();
    }
  }, [snapRoomSizes, gridSpacing, adjustRoomToGrid]);

  // Load room data - Optimized with better error handling
  const loadData = useCallback(async (matrixFile = null, roomFile = null) => {
    try {
      const readFile = async (file, defaultFileName) => {
        if (file) {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
          });
        } else {
          try {
            return await window.fs.readFile(defaultFileName, { encoding: 'utf8' });
          } catch (error) {
            console.log(`Default file ${defaultFileName} not found`);
            return null;
          }
        }
      };

      const [matrixData, roomData] = await Promise.all([
        readFile(matrixFile, 'Connectivity_Matrix.csv'),
        readFile(roomFile, 'RoomDB_with_Area.csv')
      ]);

      if (!matrixData || !roomData) {
        console.log('Required data files not found');
        return;
      }

      const parseConfig = {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
      };

      const parsedMatrix = Papa.parse(matrixData, parseConfig);
      const parsedRooms = Papa.parse(roomData, parseConfig);

      const nodesArray = parsedRooms.data.map((room, i) => {
        const area = room.Area || 25;
        const sideLength = Math.sqrt(area);
        const width = Math.max(sideLength * SCALE_FACTOR, MIN_SIZE);
        const height = Math.max(sideLength * SCALE_FACTOR, MIN_SIZE);
        
        let x = 600 + (Math.random() - 0.5) * 200;
        let y = 400 + (Math.random() - 0.5) * 200;
        
        if (gridBounds) {
          const snapped = snapToGrid(x, y, width, height);
          x = snapped.x;
          y = snapped.y;
        }
        
        return {
          id: room.Code,
          name: room.Name,
          floor: room.Floor,
          zone: room.Zone,
          area: area,
          width: width,
          height: height,
          x: x,
          y: y,
          gridAdjusted: false,
          meetsAreaRequirement: true
        };
      });

      const linksArray = [];
      const linkSet = new Set();
      
      parsedMatrix.data.forEach(row => {
        const sourceId = row[''];
        Object.keys(row).forEach(targetId => {
          if (targetId !== '' && row[targetId] > 0) {
            const linkKey = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
              linksArray.push({
                source: sourceId < targetId ? sourceId : targetId,
                target: sourceId < targetId ? targetId : sourceId,
                type: row[targetId]
              });
            }
          }
        });
      });

      setRooms(nodesArray);
      setLinks(linksArray);
      setOriginalRoomSizes(new Map());

      const totalArea = _.sumBy(nodesArray, 'area');
      const avgConnections = linksArray.length * 2 / nodesArray.length;
      setStats({
        totalRooms: nodesArray.length,
        totalConnections: linksArray.length,
        totalArea: totalArea.toFixed(0),
        avgConnections: avgConnections.toFixed(2)
      });

    } catch (error) {
      console.error('Error loading data:', error);
      alert('데이터 로딩 중 오류가 발생했습니다.');
    }
  }, [gridBounds, snapToGrid]);

  // Load default data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle CSV file uploads
  const handleCSVUpload = useCallback((event, type) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      alert('CSV 파일을 선택해주세요.');
      return;
    }
    
    if (type === 'matrix') {
      const roomFile = roomFileRef.current?.files[0] || null;
      loadData(file, roomFile);
    } else if (type === 'room') {
      const matrixFile = matrixFileRef.current?.files[0] || null;
      loadData(matrixFile, file);
    }
  }, [loadData]);

  // Handle GeoJSON file upload - Optimized parsing
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geojson = JSON.parse(e.target.result);
        
        let coordinates = null;
        
        if (geojson?.features?.[0]?.geometry?.coordinates?.[0]) {
          coordinates = geojson.features[0].geometry.coordinates[0];
        } else if (geojson?.geometry?.coordinates?.[0]) {
          coordinates = geojson.geometry.coordinates[0];
        } else if (geojson?.coordinates?.[0]) {
          coordinates = geojson.coordinates[0];
        }
        
        if (coordinates && Array.isArray(coordinates)) {
          setBoundary(coordinates);
        } else {
          alert('유효한 Polygon 형식의 GeoJSON이 아닙니다.');
        }
      } catch (error) {
        console.error('Error parsing GeoJSON:', error);
        alert('GeoJSON 파일 파싱 오류');
      }
    };
    reader.readAsText(file);
  }, []);

  // Point in polygon test - Optimized
  const pointInPolygon = useCallback((point, polygon) => {
    if (!polygon || !Array.isArray(polygon)) return true;
    
    let inside = false;
    const x = point[0], y = point[1];
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, []);

  // Rectangle corners for collision detection
  const getRectCorners = useCallback((d) => {
    if (!d) return [];
    const hw = d.width / 2;
    const hh = d.height / 2;
    return [
      [d.x - hw, d.y - hh],
      [d.x + hw, d.y - hh],
      [d.x + hw, d.y + hh],
      [d.x - hw, d.y + hh]
    ];
  }, []);

  // Check if two rooms share an edge - Optimized with better tolerance
  const areRoomsAdjacent = useCallback((room1, room2) => {
    const r1 = {
      left: room1.x - room1.width/2,
      right: room1.x + room1.width/2,
      top: room1.y - room1.height/2,
      bottom: room1.y + room1.height/2
    };
    
    const r2 = {
      left: room2.x - room2.width/2,
      right: room2.x + room2.width/2,
      top: room2.y - room2.height/2,
      bottom: room2.y + room2.height/2
    };
    
    // Check vertical edge sharing (좌우 인접)
    const verticallyAdjacent = (
      (Math.abs(r1.left - r2.right) <= EDGE_TOLERANCE || 
       Math.abs(r1.right - r2.left) <= EDGE_TOLERANCE) &&
      r1.top < r2.bottom && 
      r1.bottom > r2.top
    );
    
    // Check horizontal edge sharing (상하 인접)
    const horizontallyAdjacent = (
      (Math.abs(r1.top - r2.bottom) <= EDGE_TOLERANCE || 
       Math.abs(r1.bottom - r2.top) <= EDGE_TOLERANCE) &&
      r1.left < r2.right && 
      r1.right > r2.left
    );
    
    return verticallyAdjacent || horizontallyAdjacent;
  }, []);

  // Calculate connection satisfaction - Optimized with memoization
  const calculateConnectionSatisfaction = useCallback((nodes, links) => {
    const satisfaction = {};
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    nodes.forEach(room => {
      const requiredConnections = links.filter(l => {
        const sourceId = l.source?.id || l.source;
        const targetId = l.target?.id || l.target;
        return sourceId === room.id || targetId === room.id;
      });
      
      if (requiredConnections.length === 0) {
        satisfaction[room.id] = 1;
        return;
      }
      
      let satisfiedCount = 0;
      requiredConnections.forEach(link => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        const otherId = sourceId === room.id ? targetId : sourceId;
        const otherRoom = nodeMap.get(otherId);
        
        if (otherRoom && areRoomsAdjacent(room, otherRoom)) {
          satisfiedCount++;
        }
      });
      
      satisfaction[room.id] = satisfiedCount / requiredConnections.length;
    });
    
    return satisfaction;
  }, [areRoomsAdjacent]);

  // Check if two rooms are connected
  const areRoomsConnected = useCallback((room1Id, room2Id, links) => {
    return links.some(link => {
      const sourceId = link.source?.id || link.source;
      const targetId = link.target?.id || link.target;
      return (sourceId === room1Id && targetId === room2Id) || 
             (sourceId === room2Id && targetId === room1Id);
    });
  }, []);

  // Hard constraint collision prevention - Optimized
  const enforceNoOverlap = useCallback((nodes, links) => {
    const padding = 0;
    const maxIterations = 5;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      let hasOverlap = false;
      
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const room1 = nodes[i];
          const room2 = nodes[j];
          
          if (pinnedRooms.has(room1.id) && pinnedRooms.has(room2.id)) continue;
          
          const dx = room2.x - room1.x;
          const dy = room2.y - room1.y;
          const minDistX = (room1.width + room2.width) / 2 + padding;
          const minDistY = (room1.height + room2.height) / 2 + padding;
          
          if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
            hasOverlap = true;
            const overlapX = minDistX - Math.abs(dx);
            const overlapY = minDistY - Math.abs(dy);
            
            const moveX = overlapX < overlapY ? overlapX / 2 : 0;
            const moveY = overlapX >= overlapY ? overlapY / 2 : 0;
            
            if (!pinnedRooms.has(room1.id) && !pinnedRooms.has(room2.id)) {
              room1.x -= dx > 0 ? moveX : -moveX;
              room2.x += dx > 0 ? moveX : -moveX;
              room1.y -= dy > 0 ? moveY : -moveY;
              room2.y += dy > 0 ? moveY : -moveY;
            } else if (!pinnedRooms.has(room1.id)) {
              if (moveX) room1.x = dx > 0 ? room2.x - minDistX : room2.x + minDistX;
              if (moveY) room1.y = dy > 0 ? room2.y - minDistY : room2.y + minDistY;
            } else if (!pinnedRooms.has(room2.id)) {
              if (moveX) room2.x = dx > 0 ? room1.x + minDistX : room1.x - minDistX;
              if (moveY) room2.y = dy > 0 ? room1.y + minDistY : room1.y - minDistY;
            }
          }
        }
      }
      
      if (!hasOverlap) break;
    }
  }, [pinnedRooms]);

  // Keep rooms inside boundary - Optimized
  const enforceInsideBoundary = useCallback((nodes) => {
    if (!boundary || !Array.isArray(boundary)) return;
    
    nodes.forEach(room => {
      if (pinnedRooms.has(room.id)) return;
      
      const corners = getRectCorners(room);
      let isOutside = false;
      
      for (let corner of corners) {
        const scaledCorner = [corner[0] / SCALE_FACTOR, corner[1] / SCALE_FACTOR];
        if (!pointInPolygon(scaledCorner, boundary)) {
          isOutside = true;
          break;
        }
      }
      
      if (isOutside) {
        room.x = room.prevX || room.x;
        room.y = room.prevY || room.y;
      } else {
        room.prevX = room.x;
        room.prevY = room.y;
      }
    });
  }, [boundary, pinnedRooms, pointInPolygon, getRectCorners]);

  // Swap rooms function
  const trySwapRooms = useCallback((room1, room2, nodes, links) => {
    const currentSatisfaction = calculateConnectionSatisfaction(nodes, links);
    const currentAvg = Object.values(currentSatisfaction).reduce((a, b) => a + b, 0) / Object.keys(currentSatisfaction).length;
    
    const temp1 = { x: room1.x, y: room1.y };
    const temp2 = { x: room2.x, y: room2.y };
    
    room1.x = temp2.x;
    room1.y = temp2.y;
    room2.x = temp1.x;
    room2.y = temp1.y;
    
    const newSatisfaction = calculateConnectionSatisfaction(nodes, links);
    const newAvg = Object.values(newSatisfaction).reduce((a, b) => a + b, 0) / Object.keys(newSatisfaction).length;
    
    if (newAvg <= currentAvg) {
      room1.x = temp1.x;
      room1.y = temp1.y;
      room2.x = temp2.x;
      room2.y = temp2.y;
      return false;
    }
    
    return true;
  }, [calculateConnectionSatisfaction]);

  // Find available edges for a room
  const findAvailableEdges = useCallback((room, allRooms, links) => {
    const edges = {
      top: true,
      bottom: true,
      left: true,
      right: true
    };
    
    // 방의 경계
    const r1 = {
      left: room.x - room.width/2,
      right: room.x + room.width/2,
      top: room.y - room.height/2,
      bottom: room.y + room.height/2
    };
    
    // 다른 방들과의 인접 확인
    allRooms.forEach(other => {
      if (other.id === room.id) return;
      
      const r2 = {
        left: other.x - other.width/2,
        right: other.x + other.width/2,
        top: other.y - other.height/2,
        bottom: other.y + other.height/2
      };
      
      // 상단 변 확인
      if (Math.abs(r1.top - r2.bottom) <= EDGE_TOLERANCE &&
          r1.left < r2.right - EDGE_TOLERANCE && 
          r1.right > r2.left + EDGE_TOLERANCE) {
        edges.top = false;
      }
      
      // 하단 변 확인
      if (Math.abs(r1.bottom - r2.top) <= EDGE_TOLERANCE &&
          r1.left < r2.right - EDGE_TOLERANCE && 
          r1.right > r2.left + EDGE_TOLERANCE) {
        edges.bottom = false;
      }
      
      // 왼쪽 변 확인
      if (Math.abs(r1.left - r2.right) <= EDGE_TOLERANCE &&
          r1.top < r2.bottom - EDGE_TOLERANCE && 
          r1.bottom > r2.top + EDGE_TOLERANCE) {
        edges.left = false;
      }
      
      // 오른쪽 변 확인
      if (Math.abs(r1.right - r2.left) <= EDGE_TOLERANCE &&
          r1.top < r2.bottom - EDGE_TOLERANCE && 
          r1.bottom > r2.top + EDGE_TOLERANCE) {
        edges.right = false;
      }
    });
    
    return edges;
  }, []);

  // Find best placement for two rooms to connect
  const findBestPlacement = useCallback((room1, room2, allRooms) => {
    const edges1 = findAvailableEdges(room1, allRooms, links);
    const edges2 = findAvailableEdges(room2, allRooms, links);
    
    const placements = [];
    
    // room1의 각 사용 가능한 변에 대해
    Object.entries(edges1).forEach(([edge1, available1]) => {
      if (!available1) return;
      
      // room2의 각 사용 가능한 변에 대해
      Object.entries(edges2).forEach(([edge2, available2]) => {
        if (!available2) return;
        
        // 연결 가능한 조합인지 확인 (마주보는 변이어야 함)
        const oppositeEdges = {
          'top': 'bottom',
          'bottom': 'top',
          'left': 'right',
          'right': 'left'
        };
        
        if (oppositeEdges[edge1] !== edge2) return;
        
        // 새로운 위치 계산
        let newX2 = room2.x;
        let newY2 = room2.y;
        
        switch (edge1) {
          case 'top':
            newY2 = room1.y - room1.height/2 - room2.height/2;
            newX2 = room1.x; // 중앙 정렬
            break;
          case 'bottom':
            newY2 = room1.y + room1.height/2 + room2.height/2;
            newX2 = room1.x; // 중앙 정렬
            break;
          case 'left':
            newX2 = room1.x - room1.width/2 - room2.width/2;
            newY2 = room1.y; // 중앙 정렬
            break;
          case 'right':
            newX2 = room1.x + room1.width/2 + room2.width/2;
            newY2 = room1.y; // 중앙 정렬
            break;
        }
        
        // 이 위치가 다른 방과 겹치지 않는지 확인
        let overlap = false;
        for (let other of allRooms) {
          if (other.id === room1.id || other.id === room2.id) continue;
          
          const dx = other.x - newX2;
          const dy = other.y - newY2;
          const minDistX = (room2.width + other.width) / 2;
          const minDistY = (room2.height + other.height) / 2;
          
          if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
            overlap = true;
            break;
          }
        }
        
        if (!overlap) {
          placements.push({
            x: newX2,
            y: newY2,
            edge1: edge1,
            edge2: edge2,
            distance: Math.hypot(newX2 - room2.x, newY2 - room2.y)
          });
        }
      });
    });
    
    // 가장 가까운 이동 거리를 가진 배치 선택
    return placements.sort((a, b) => a.distance - b.distance)[0] || null;
  }, [findAvailableEdges, links]);

  // Find blocked rooms
  const findBlockedRooms = useCallback((nodes, links) => {
    const blockedRooms = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    nodes.forEach(room => {
      const unsatisfiedLinks = links.filter(link => {
        const sourceId = link.source?.id || link.source;
        const targetId = link.target?.id || link.target;
        if (sourceId === room.id || targetId === room.id) {
          const otherId = sourceId === room.id ? targetId : sourceId;
          const otherRoom = nodeMap.get(otherId);
          return otherRoom && !areRoomsAdjacent(room, otherRoom);
        }
        return false;
      });
      
      if (unsatisfiedLinks.length > 0) {
        let canMove = false;
        unsatisfiedLinks.forEach(link => {
          const sourceId = link.source?.id || link.source;
          const targetId = link.target?.id || link.target;
          const otherId = sourceId === room.id ? targetId : sourceId;
          const targetRoom = nodeMap.get(otherId);
          
          if (targetRoom) {
            const dx = targetRoom.x - room.x;
            const dy = targetRoom.y - room.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            const testX = room.x + (dx / distance) * 5;
            const testY = room.y + (dy / distance) * 5;
            
            let blocked = false;
            for (let other of nodes) {
              if (other.id !== room.id) {
                const otherDx = other.x - testX;
                const otherDy = other.y - testY;
                const minDistX = (room.width + other.width) / 2;
                const minDistY = (room.height + other.height) / 2;
                
                if (Math.abs(otherDx) < minDistX && Math.abs(otherDy) < minDistY) {
                  blocked = true;
                  break;
                }
              }
            }
            
            if (!blocked) canMove = true;
          }
        });
        
        if (!canMove) {
          blockedRooms.push(room);
        }
      }
    });
    
    return blockedRooms;
  }, [areRoomsAdjacent]);

  // Helper function to find connected rooms
  const getConnectedRooms = useCallback((room, links, nodes) => {
    const connected = [];
    links.forEach(link => {
      const sourceId = link.source?.id || link.source;
      const targetId = link.target?.id || link.target;
      if (sourceId === room.id || targetId === room.id) {
        const otherId = sourceId === room.id ? targetId : sourceId;
        const otherRoom = nodes.find(r => r.id === otherId);
        if (otherRoom) connected.push(otherRoom);
      }
    });
    return connected;
  }, []);

  // Helper function to find empty spaces
  const findEmptySpaces = useCallback((nodes, gridBounds, minSpacing = 50) => {
    const emptySpaces = [];
    if (!gridBounds) return emptySpaces;
    
    for (let x = gridBounds.minX + minSpacing; x < gridBounds.maxX - minSpacing; x += minSpacing) {
      for (let y = gridBounds.minY + minSpacing; y < gridBounds.maxY - minSpacing; y += minSpacing) {
        let isEmpty = true;
        
        for (let room of nodes) {
          const dx = Math.abs(room.x - x);
          const dy = Math.abs(room.y - y);
          const minDistX = room.width / 2 + minSpacing / 2;
          const minDistY = room.height / 2 + minSpacing / 2;
          
          if (dx < minDistX && dy < minDistY) {
            isEmpty = false;
            break;
          }
        }
        
        if (isEmpty) {
          emptySpaces.push({ x, y });
        }
      }
    }
    
    return emptySpaces;
  }, []);

  // Progressive optimization - Optimized with RAF and slower speed
  const progressiveOptimization = useCallback(() => {
    if (!simulationRef.current || isOptimizing) return;
    
    setIsOptimizing(true);
    optimizationCancelRef.current = false;
    setOptimizationPhase(1);
    
    const nodes = simulationRef.current.nodes();
    const maxIterations = optimizationMode === 'smart' ? 150 : 100;
    let iteration = 0;
    let previousSatisfaction = 0;
    let currentPhase = 1;
    let stagnationCount = 0;
    
    const optimizationStep = () => {
      if (optimizationCancelRef.current) {
        setIsOptimizing(false);
        optimizationCancelRef.current = false;
        setOptimizationPhase(0);
        return;
      }
      
      const satisfaction = calculateConnectionSatisfaction(nodes, links);
      const avgSatisfaction = Object.values(satisfaction).reduce((a,b) => a+b, 0) / Object.keys(satisfaction).length;
      
      setOptimizationProgress({
        iteration: iteration,
        satisfaction: avgSatisfaction * 100
      });
      
      // 온도 개념 도입 (시뮬레이티드 어닐링)
      const temperature = Math.max(0.1, 1 - (iteration / maxIterations));
      
      // 정체 감지
      if (Math.abs(avgSatisfaction - previousSatisfaction) < 0.005) {
        stagnationCount++;
      } else {
        stagnationCount = 0;
      }
      
      // 정체 상태에서 적극적인 조치 (95% 미만일 때)
      if (stagnationCount > 10 && avgSatisfaction < 0.95) {
        console.log(`Stagnation detected at ${(avgSatisfaction * 100).toFixed(1)}%, applying aggressive strategy`);
        
        // 1. 가장 불만족한 방들과 부분 만족 방들에 대해 체인 이동 시도
        const problemRooms = nodes
          .filter(room => satisfaction[room.id] < 1 && !pinnedRooms.has(room.id))
          .sort((a, b) => {
            // 부분 만족(0.5~0.99)인 방들도 우선순위 부여
            const priorityA = satisfaction[a.id] < 0.5 ? 0 : 1;
            const priorityB = satisfaction[b.id] < 0.5 ? 0 : 1;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return satisfaction[a.id] - satisfaction[b.id];
          })
          .slice(0, 8); // 5에서 8로 증가
        
        problemRooms.forEach(room => {
          const connectedRooms = getConnectedRooms(room, links, nodes);
          
          if (connectedRooms.length > 0) {
            // 연결된 방들의 중심 계산
            const centerX = connectedRooms.reduce((sum, r) => sum + r.x, 0) / connectedRooms.length;
            const centerY = connectedRooms.reduce((sum, r) => sum + r.y, 0) / connectedRooms.length;
            
            // 부분 만족 방들은 더 정확한 위치로 이동
            if (satisfaction[room.id] >= 0.5) {
              // 연결되어야 하는 방과의 정확한 거리 계산
              connectedRooms.forEach(targetRoom => {
                if (!areRoomsAdjacent(room, targetRoom)) {
                  const dx = targetRoom.x - room.x;
                  const dy = targetRoom.y - room.y;
                  const targetDistX = (room.width + targetRoom.width) / 2;
                  const targetDistY = (room.height + targetRoom.height) / 2;
                  
                  // 더 직접적인 이동
                  if (Math.abs(dx) > Math.abs(dy)) {
                    room.x += dx > 0 ? targetDistX - Math.abs(dx) : -(targetDistX - Math.abs(dx));
                  } else {
                    room.y += dy > 0 ? targetDistY - Math.abs(dy) : -(targetDistY - Math.abs(dy));
                  }
                }
              });
            } else {
              // 매우 불만족한 방들은 기존 방식대로
              const jumpDistance = 100 * temperature + 50;
              const angle = Math.random() * Math.PI * 2;
              
              const targetX = centerX + Math.cos(angle) * jumpDistance;
              const targetY = centerY + Math.sin(angle) * jumpDistance;
              
              const moveRatio = 0.5 + temperature * 0.3;
              room.x += (targetX - room.x) * moveRatio;
              room.y += (targetY - room.y) * moveRatio;
            }
            
            // 연결된 방들도 약간 따라 이동
            connectedRooms.forEach(connRoom => {
              if (!pinnedRooms.has(connRoom.id) && !areRoomsAdjacent(room, connRoom)) {
                const dx = (room.x - connRoom.x) * 0.1;
                const dy = (room.y - connRoom.y) * 0.1;
                connRoom.x += dx;
                connRoom.y += dy;
              }
            });
          }
        });
        
        // 2. 빈 공간 찾아서 막힌 방 이동
        const emptySpaces = findEmptySpaces(nodes, gridBounds);
        if (emptySpaces.length > 0) {
          const blockedRooms = nodes.filter(room => 
            satisfaction[room.id] < 1 && // 부분 만족 방들도 포함
            !pinnedRooms.has(room.id) &&
            getConnectedRooms(room, links, nodes).filter(cr => 
              areRoomsAdjacent(room, cr)
            ).length === 0
          );
          
          blockedRooms.slice(0, 3).forEach((room, idx) => {
            if (idx < emptySpaces.length) {
              const target = emptySpaces[idx];
              room.x += (target.x - room.x) * 0.7;
              room.y += (target.y - room.y) * 0.7;
            }
          });
        }
        
        stagnationCount = 0;
      }
      
      // Smart mode phases
      if (optimizationMode === 'smart') {
        if (currentPhase === 1 && iteration < 30) {
          setOptimizationPhase(1);
          
          const unsatisfiedRooms = nodes.filter(room => satisfaction[room.id] < 0.5)
            .sort((a, b) => satisfaction[a.id] - satisfaction[b.id]);
          
          unsatisfiedRooms.forEach(room => {
            if (pinnedRooms.has(room.id)) return;
            
            const connectedRooms = [];
            links.forEach(link => {
              const sourceId = link.source?.id || link.source;
              const targetId = link.target?.id || link.target;
              if (sourceId === room.id || targetId === room.id) {
                const otherId = sourceId === room.id ? targetId : sourceId;
                const otherRoom = nodes.find(r => r.id === otherId);
                if (otherRoom) connectedRooms.push(otherRoom);
              }
            });
            
            if (connectedRooms.length > 0) {
              const centerX = connectedRooms.reduce((sum, r) => sum + r.x, 0) / connectedRooms.length;
              const centerY = connectedRooms.reduce((sum, r) => sum + r.y, 0) / connectedRooms.length;
              
              room.x += (centerX - room.x) * 0.2;
              room.y += (centerY - room.y) * 0.2;
              
              enforceInsideBoundary([room]);
            }
          });
        } else if (currentPhase === 1 && iteration >= 30) {
          currentPhase = 2;
          setOptimizationPhase(2);
        } else if (currentPhase === 2 && iteration < 60) {
          enforceNoOverlap(nodes, links);
          enforceNoOverlap(nodes, links);
        } else if (currentPhase === 2 && iteration >= 60) {
          currentPhase = 3;
          setOptimizationPhase(3);
        }
      }
      
      // Basic optimization logic - 부분 만족(노란색) 방들도 적극적으로 처리
      const unsatisfiedRooms = nodes.filter(room => satisfaction[room.id] < 1)
        .sort((a, b) => satisfaction[a.id] - satisfaction[b.id])
        .slice(0, 15); // 10에서 15로 증가
      
      // 부분 만족 방들에 대한 특별 처리
      const partialSatisfiedRooms = nodes.filter(room => 
        satisfaction[room.id] >= 0.5 && satisfaction[room.id] < 1
      );
      
      // 노란색 방들도 적극적으로 이동
      if (iteration > 20) {
        partialSatisfiedRooms.forEach(room => {
          if (pinnedRooms.has(room.id)) return;
          
          const connectedRooms = getConnectedRooms(room, links, nodes);
          connectedRooms.forEach(targetRoom => {
            if (!areRoomsAdjacent(room, targetRoom)) {
              // 부분 만족 방들은 더 적극적으로 이동
              const dx = targetRoom.x - room.x;
              const dy = targetRoom.y - room.y;
              const distance = Math.hypot(dx, dy);
              
              // 온도와 상관없이 항상 일정 수준 이상 이동
              const moveRatio = 0.15 + (1 - satisfaction[room.id]) * 0.2;
              const moveDistance = Math.min(distance * moveRatio, 30);
              
              room.x += (dx / distance) * moveDistance;
              room.y += (dy / distance) * moveDistance;
            }
          });
        });
      }
      
      // 개선된 최적화: 비어있는 변을 찾아서 연결
      if (optimizationMode !== 'conservative' && iteration > 30) {
        unsatisfiedRooms.forEach(room => {
          if (pinnedRooms.has(room.id)) return;
          
          const disconnectedLinks = links.filter(link => {
            const sourceId = link.source?.id || link.source;
            const targetId = link.target?.id || link.target;
            if (sourceId === room.id || targetId === room.id) {
              const otherId = sourceId === room.id ? targetId : sourceId;
              const otherRoom = nodes.find(r => r.id === otherId);
              return otherRoom && !areRoomsAdjacent(room, otherRoom);
            }
            return false;
          });
          
          disconnectedLinks.forEach(link => {
            const sourceId = link.source?.id || link.source;
            const targetId = link.target?.id || link.target;
            const otherId = sourceId === room.id ? targetId : sourceId;
            const otherRoom = nodes.find(r => r.id === otherId);
            
            if (otherRoom && !pinnedRooms.has(otherRoom.id)) {
              // 비어있는 변을 사용한 최적 배치 찾기
              const bestPlacement = findBestPlacement(room, otherRoom, nodes);
              
              if (bestPlacement) {
                // 점진적으로 이동
                const moveRatio = optimizationMode === 'smart' ? 0.3 : 0.5;
                otherRoom.x += (bestPlacement.x - otherRoom.x) * moveRatio;
                otherRoom.y += (bestPlacement.y - otherRoom.y) * moveRatio;
                
                // 그리드 스냅
                if (gridBounds && snapToGridEnabled && currentPhase === 3) {
                  const snapped = snapToGrid(otherRoom.x, otherRoom.y, otherRoom.width, otherRoom.height);
                  otherRoom.x = snapped.x;
                  otherRoom.y = snapped.y;
                }
              }
            }
          });
        });
      }
      
      // 기존 블록된 방 교환 로직
      if (optimizationMode !== 'conservative') {
        const blockedRooms = findBlockedRooms(nodes, links);
        blockedRooms.slice(0, 5).forEach(blockedRoom => {
          let swapped = false;
          for (let otherRoom of nodes) {
            if (!swapped && otherRoom.id !== blockedRoom.id && !pinnedRooms.has(otherRoom.id)) {
              const distance = Math.hypot(blockedRoom.x - otherRoom.x, blockedRoom.y - otherRoom.y);
              if (distance < 200) {
                swapped = trySwapRooms(blockedRoom, otherRoom, nodes, links);
                if (swapped) break;
              }
            }
          }
        });
      }
      
      unsatisfiedRooms.forEach(room => {
        if (pinnedRooms.has(room.id)) return;
        
        const disconnectedLinks = links.filter(link => {
          const sourceId = link.source?.id || link.source;
          const targetId = link.target?.id || link.target;
          if (sourceId === room.id || targetId === room.id) {
            const otherId = sourceId === room.id ? targetId : sourceId;
            const otherRoom = nodes.find(r => r.id === otherId);
            return otherRoom && !areRoomsAdjacent(room, otherRoom);
          }
          return false;
        });
        
        if (disconnectedLinks.length > 0) {
          let closestRoom = null;
          let minDistance = Infinity;
          
          disconnectedLinks.forEach(link => {
            const sourceId = link.source?.id || link.source;
            const targetId = link.target?.id || link.target;
            const otherId = sourceId === room.id ? targetId : sourceId;
            const otherRoom = nodes.find(r => r.id === otherId);
            
            if (otherRoom) {
              const distance = Math.hypot(room.x - otherRoom.x, room.y - otherRoom.y);
              if (distance < minDistance) {
                minDistance = distance;
                closestRoom = otherRoom;
              }
            }
          });
          
          if (closestRoom) {
            const dx = closestRoom.x - room.x;
            const dy = closestRoom.y - room.y;
            const distance = Math.hypot(dx, dy);
            
            let moveMultiplier = 0.1;
            if (optimizationMode === 'aggressive') moveMultiplier = 0.2;
            if (optimizationMode === 'smart' && currentPhase === 1) moveMultiplier = 0.15;
            
            // 온도를 고려한 이동 거리
            const tempBoost = stagnationCount > 5 ? (1 + temperature) : 1;
            const moveDistance = Math.min(distance * moveMultiplier * tempBoost, gridSpacing * SCALE_FACTOR * 2);
            const moveX = (dx / distance) * moveDistance;
            const moveY = (dy / distance) * moveDistance;
            
            let newX = room.x + moveX;
            let newY = room.y + moveY;
            
            if (gridBounds && snapToGridEnabled && currentPhase !== 1) {
              const snapped = snapToGrid(newX, newY, room.width, room.height);
              newX = snapped.x;
              newY = snapped.y;
            }
            
            const oldX = room.x;
            const oldY = room.y;
            room.x = newX;
            room.y = newY;
            
            if (optimizationMode === 'conservative' || currentPhase === 3) {
              const corners = getRectCorners(room);
              let isInsideBoundary = true;
              if (boundary) {
                for (let corner of corners) {
                  const scaledCorner = [corner[0] / SCALE_FACTOR, corner[1] / SCALE_FACTOR];
                  if (!pointInPolygon(scaledCorner, boundary)) {
                    isInsideBoundary = false;
                    break;
                  }
                }
              }
              
              let hasOverlap = false;
              for (let otherRoom of nodes) {
                if (otherRoom.id === room.id) continue;
                
                const dx = otherRoom.x - room.x;
                const dy = otherRoom.y - room.y;
                const minDistX = (room.width + otherRoom.width) / 2;
                const minDistY = (room.height + otherRoom.height) / 2;
                
                if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
                  hasOverlap = true;
                  break;
                }
              }
              
              if (!isInsideBoundary || hasOverlap) {
                room.x = oldX;
                room.y = oldY;
              }
            }
          }
        }
      });
      
      if (currentPhase >= 2 || optimizationMode === 'conservative') {
        enforceNoOverlap(nodes, links);
      }
      
      // 미세 조정 단계에서 더 정밀한 정렬
      if (currentPhase === 3 && avgSatisfaction > 0.9) {
        // 거의 만족하는 방들에 대해 정밀 조정
        const almostSatisfiedRooms = nodes.filter(room => 
          satisfaction[room.id] > 0.8 && satisfaction[room.id] < 1
        );
        
        almostSatisfiedRooms.forEach(room => {
          if (pinnedRooms.has(room.id)) return;
          
          links.forEach(link => {
            const sourceId = link.source?.id || link.source;
            const targetId = link.target?.id || link.target;
            if (sourceId === room.id || targetId === room.id) {
              const otherId = sourceId === room.id ? targetId : sourceId;
              const otherRoom = nodes.find(r => r.id === otherId);
              
              if (otherRoom && !areRoomsAdjacent(room, otherRoom)) {
                // 아주 작은 조정으로 정확히 맞추기
                const dx = otherRoom.x - room.x;
                const dy = otherRoom.y - room.y;
                const targetDistX = (room.width + otherRoom.width) / 2;
                const targetDistY = (room.height + otherRoom.height) / 2;
                
                // 수평 또는 수직으로 가까운 경우 정렬
                if (Math.abs(Math.abs(dx) - targetDistX) < 10) {
                  const adjustment = Math.abs(dx) - targetDistX;
                  room.x += dx > 0 ? adjustment/2 : -adjustment/2;
                  if (!pinnedRooms.has(otherRoom.id)) {
                    otherRoom.x -= dx > 0 ? adjustment/2 : -adjustment/2;
                  }
                }
                
                if (Math.abs(Math.abs(dy) - targetDistY) < 10) {
                  const adjustment = Math.abs(dy) - targetDistY;
                  room.y += dy > 0 ? adjustment/2 : -adjustment/2;
                  if (!pinnedRooms.has(otherRoom.id)) {
                    otherRoom.y -= dy > 0 ? adjustment/2 : -adjustment/2;
                  }
                }
              }
            }
          });
        });
      }
      
      if (avgSatisfaction >= 0.99 || iteration >= maxIterations) {
        setIsOptimizing(false);
        setOptimizationPhase(0);
        simulationRef.current.alpha(0.3).restart();
        return;
      }
      
      // 개선이 없는 경우 종료 조건 제거
      previousSatisfaction = avgSatisfaction;
      
      simulationRef.current.alpha(0.1).restart();
      
      iteration++;
      // 최적화 속도를 절반으로 줄이기 위해 딜레이 추가
      setTimeout(() => {
        requestAnimationFrame(optimizationStep);
      }, 50); // 50ms 딜레이 추가
    };
    
    optimizationStep();
  }, [calculateConnectionSatisfaction, links, pinnedRooms, areRoomsAdjacent, 
      gridBounds, snapToGrid, boundary, pointInPolygon, isOptimizing, 
      gridSpacing, optimizationMode, enforceNoOverlap,
      enforceInsideBoundary, findBlockedRooms, trySwapRooms, getRectCorners,
      findBestPlacement, snapToGridEnabled, getConnectedRooms, findEmptySpaces]);

  // Cancel optimization
  const cancelOptimization = useCallback(() => {
    optimizationCancelRef.current = true;
  }, []);
  
  // Update statistics when rooms or links change
  useEffect(() => {
    if (rooms.length > 0) {
      const totalArea = _.sumBy(rooms, 'area');
      const avgConnections = links.length > 0 ? links.length * 2 / rooms.length : 0;
      setStats({
        totalRooms: rooms.length,
        totalConnections: links.length,
        totalArea: totalArea.toFixed(0),
        avgConnections: avgConnections.toFixed(2)
      });
    }
  }, [rooms, links]);

  // Handle clicks outside menu
  useEffect(() => {
    const handleClick = () => {
      if (showDeleteMenu || showDeleteConfirm || showDimensionEdit) {
        setShowDeleteMenu(false);
        setShowDeleteConfirm(false);
        setShowDimensionEdit(false);
        setSelectedRoom(null);
      }
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showDeleteMenu, showDeleteConfirm, showDimensionEdit]);

  // Memoized filtered data
  const { filteredRooms, filteredLinks } = useMemo(() => {
    const filteredRooms = selectedFloor === 'all' 
      ? rooms 
      : rooms.filter(r => r.floor === selectedFloor);
    
    const filteredRoomIds = new Set(filteredRooms.map(r => r.id));
    const filteredLinks = links.filter(l => {
      const sourceId = l.source?.id || l.source;
      const targetId = l.target?.id || l.target;
      return filteredRoomIds.has(sourceId) && filteredRoomIds.has(targetId);
    });
    
    return { filteredRooms, filteredLinks };
  }, [rooms, links, selectedFloor]);

  // Setup D3 force simulation
  useEffect(() => {
    if (!filteredRooms.length) return;

    const width = 1200;
    const height = 800;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Grid rendering
    if (showGrid && gridBounds) {
      const gridSizePixels = gridSpacing * SCALE_FACTOR;
      const gridGroup = g.append("g").attr("class", "grid");
      
      // Vertical lines
      for (let x = gridBounds.minX; x <= gridBounds.maxX; x += gridSizePixels) {
        gridGroup.append("line")
          .attr("x1", x)
          .attr("y1", gridBounds.minY)
          .attr("x2", x)
          .attr("y2", gridBounds.maxY)
          .attr("stroke", "#e0e0e0")
          .attr("stroke-width", 0.5);
      }
      
      // Horizontal lines
      for (let y = gridBounds.minY; y <= gridBounds.maxY; y += gridSizePixels) {
        gridGroup.append("line")
          .attr("x1", gridBounds.minX)
          .attr("y1", y)
          .attr("x2", gridBounds.maxX)
          .attr("y2", y)
          .attr("stroke", "#e0e0e0")
          .attr("stroke-width", 0.5);
      }
    }

    // Boundary rendering
    if (boundary && Array.isArray(boundary)) {
      const scaledBoundary = boundary.map(point => [point[0] * SCALE_FACTOR, point[1] * SCALE_FACTOR]);
      
      const boundaryPath = d3.line()
        .x(d => d[0])
        .y(d => d[1]);
      
      g.append("path")
        .datum(scaledBoundary)
        .attr("d", boundaryPath)
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");
    }

    // Force simulation - 기존 simulation이 있으면 재사용
    let simulation;
    if (simulationRef.current && simulationRef.current.nodes().length === filteredRooms.length) {
      // 기존 simulation 재사용
      simulation = simulationRef.current;
      simulation.nodes(filteredRooms);
      simulation.force("link").links(filteredLinks);
      simulation.alpha(0.3).restart();
    } else {
      // 새로운 simulation 생성
      simulation = d3.forceSimulation(filteredRooms)
        .force("link", d3.forceLink(filteredLinks)
          .id(d => d.id)
          .distance(d => {
            const sourceRoom = typeof d.source === 'object' ? d.source : filteredRooms.find(r => r.id === d.source);
            const targetRoom = typeof d.target === 'object' ? d.target : filteredRooms.find(r => r.id === d.target);
            if (sourceRoom && targetRoom) {
              return Math.min(sourceRoom.width, targetRoom.width) / 2 + Math.min(sourceRoom.height, targetRoom.height) / 2;
            }
            return 50;
          })
          .strength(linkStrength))
        .force("x", d3.forceX(width / 2).strength(0.01))
        .force("y", d3.forceY(height / 2).strength(0.01))
        .alphaDecay(0.02)
        .velocityDecay(0.7);

      simulationRef.current = simulation;
    }

    // Links
    const link = g.append("g")
      .selectAll("line")
      .data(filteredLinks)
      .enter().append("line")
      .attr("stroke", d => {
        switch(d.type) {
          case 1: return "#4A90E2";
          case 2: return "#E94B3C";
          case 3: return "#7B68EE";
          default: return "#999";
        }
      })
      .attr("stroke-opacity", d => showConnections ? 0.6 : 0)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", d => d.type === 1 ? "5,5" : "none");

    svg.on("contextmenu", (event) => {
      event.preventDefault();
    });

    // Room groups
    const roomGroups = g.append("g")
      .selectAll("g")
      .data(filteredRooms)
      .enter().append("g")
      .attr("class", "room")
      .style("cursor", "move");

    const rects = roomGroups.append("rect")
      .attr("width", d => d.width)
      .attr("height", d => d.height)
      .attr("x", d => -d.width/2)
      .attr("y", d => -d.height/2)
      .attr("fill", d => colorScale(d.zone))
      .attr("fill-opacity", 0.2)
      .attr("stroke", d => {
        if (pinnedRooms.has(d.id)) return "#ff0000";
        if (d.gridAdjusted && !d.meetsAreaRequirement) return "#ff6b6b";
        return "#333";
      })
      .attr("stroke-width", d => pinnedRooms.has(d.id) ? 3 : 2)
      .attr("stroke-dasharray", d => d.gridAdjusted && !d.meetsAreaRequirement ? "5,5" : "none")
      .attr("rx", 2);

    // Warning icons
    roomGroups.each(function(d) {
      if (d.gridAdjusted && !d.meetsAreaRequirement) {
        d3.select(this).append("text")
          .attr("x", d.width/2 - 10)
          .attr("y", -d.height/2 + 10)
          .attr("fill", "#ff0000")
          .style("font-size", "12px")
          .style("font-weight", "bold")
          .text("!");
      }
    });
      
    // Room interactions
    rects.on("dblclick", function(event, d) {
      event.stopPropagation();
      setPinnedRooms(prev => {
        const newSet = new Set(prev);
        if (newSet.has(d.id)) {
          newSet.delete(d.id);
          d.fx = null;
          d.fy = null;
        } else {
          newSet.add(d.id);
          d.fx = d.x;
          d.fy = d.y;
        }
        return newSet;
      });
    });
    
    roomGroups.on("mousedown", function(event, d) {
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        
        const svgRect = svgRef.current.getBoundingClientRect();
        setMenuPosition({
          x: event.clientX - svgRect.left,
          y: event.clientY - svgRect.top
        });
        setSelectedRoom(d);
        setShowDeleteMenu(true);
      }
    });

    // Room labels
    roomGroups.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "10px")
      .style("font-weight", "bold")
      .style("pointer-events", "none")
      .text(d => d.name || d.id);

    // Drag behavior
    const drag = d3.drag()
      .on("start", function(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", function(event, d) {
        if (gridBounds && snapToGridEnabled) {
          const snapped = snapToGrid(event.x, event.y, d.width, d.height);
          d.fx = snapped.x;
          d.fy = snapped.y;
          d.x = snapped.x;
          d.y = snapped.y;
        } else {
          d.fx = event.x;
          d.fy = event.y;
          d.x = event.x;
          d.y = event.y;
        }
        
        enforceInsideBoundary([d]);
        enforceNoOverlap(filteredRooms, filteredLinks);
        
        d3.select(this)
          .attr("transform", `translate(${d.x},${d.y})`);
      })
      .on("end", function(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        if (!pinnedRooms.has(d.id)) {
          d.fx = null;
          d.fy = null;
        }
      });

    roomGroups.call(drag);

    // Simulation tick
    simulation.on("tick", () => {
      enforceInsideBoundary(filteredRooms);
      enforceNoOverlap(filteredRooms, filteredLinks);
      
      if (gridBounds && snapToGridEnabled) {
        filteredRooms.forEach(room => {
          if (!pinnedRooms.has(room.id)) {
            const snapped = snapToGrid(room.x, room.y, room.width, room.height);
            room.x = snapped.x;
            room.y = snapped.y;
          }
        });
      }
      
      // Edge alignment
      filteredLinks.forEach(link => {
        const source = typeof link.source === 'object' ? link.source : filteredRooms.find(r => r.id === link.source);
        const target = typeof link.target === 'object' ? link.target : filteredRooms.find(r => r.id === link.target);
        
        if (source && target) {
          const dx = Math.abs(source.x - target.x);
          const dy = Math.abs(source.y - target.y);
          const touchDistX = (source.width + target.width) / 2;
          const touchDistY = (source.height + target.height) / 2;
          
          const alignThreshold = EDGE_TOLERANCE + 1;
          
          if (!pinnedRooms.has(source.id) || !pinnedRooms.has(target.id)) {
            if (Math.abs(dx - touchDistX) <= alignThreshold && dy < touchDistY - alignThreshold) {
              if (!pinnedRooms.has(source.id) && !pinnedRooms.has(target.id)) {
                const avgX = (source.x + target.x) / 2;
                source.x = source.x < target.x ? avgX - touchDistX / 2 : avgX + touchDistX / 2;
                target.x = target.x > source.x ? avgX + touchDistX / 2 : avgX - touchDistX / 2;
              } else if (pinnedRooms.has(source.id)) {
                target.x = source.x < target.x ? source.x + touchDistX : source.x - touchDistX;
              } else {
                source.x = target.x < source.x ? target.x + touchDistX : target.x - touchDistX;
              }
            }
            
            if (Math.abs(dy - touchDistY) <= alignThreshold && dx < touchDistX - alignThreshold) {
              if (!pinnedRooms.has(source.id) && !pinnedRooms.has(target.id)) {
                const avgY = (source.y + target.y) / 2;
                source.y = source.y < target.y ? avgY - touchDistY / 2 : avgY + touchDistY / 2;
                target.y = target.y > source.y ? avgY + touchDistY / 2 : avgY - touchDistY / 2;
              } else if (pinnedRooms.has(source.id)) {
                target.y = source.y < target.y ? source.y + touchDistY : source.y - touchDistY;
              } else {
                source.y = target.y < source.y ? target.y + touchDistY : target.y - touchDistY;
              }
            }
          }
        }
      });
      
      const satisfaction = calculateConnectionSatisfaction(filteredRooms, filteredLinks);
      setConnectionSatisfaction(satisfaction);
      
      roomGroups.selectAll("rect")
        .attr("fill", d => getSatisfactionColor(satisfaction[d.id] || 0));
      
      link
        .attr("x1", d => {
          if (d.source && d.source.x !== undefined) return d.source.x;
          console.warn("Link source missing x:", d);
          return 0;
        })
        .attr("y1", d => {
          if (d.source && d.source.y !== undefined) return d.source.y;
          console.warn("Link source missing y:", d);
          return 0;
        })
        .attr("x2", d => {
          if (d.target && d.target.x !== undefined) return d.target.x;
          console.warn("Link target missing x:", d);
          return 0;
        })
        .attr("y2", d => {
          if (d.target && d.target.y !== undefined) return d.target.y;
          console.warn("Link target missing y:", d);
          return 0;
        });

      roomGroups.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };

  }, [filteredRooms, filteredLinks, boundary, showConnections, pinnedRooms, 
      enforceNoOverlap, enforceInsideBoundary, calculateConnectionSatisfaction, 
      showGrid, gridBounds, gridSpacing, snapToGrid, linkStrength,
      colorScale, getSatisfactionColor]);

  // Simple optimize layout
  const simpleOptimizeLayout = useCallback(() => {
    if (simulationRef.current) {
      if (gridBounds) {
        const centerX = (gridBounds.minX + gridBounds.maxX) / 2;
        const centerY = (gridBounds.minY + gridBounds.maxY) / 2;
        
        const nodes = simulationRef.current.nodes();
        
        nodes.forEach(room => {
          if (!pinnedRooms.has(room.id)) {
            room.x = centerX + (Math.random() - 0.5) * 100;
            room.y = centerY + (Math.random() - 0.5) * 100;
            room.vx = 0;
            room.vy = 0;
          }
        });
      }
      
      simulationRef.current.alpha(1).restart();
    }
  }, [gridBounds, pinnedRooms]);

  // Clear boundary
  const clearBoundary = useCallback(() => {
    setBoundary(null);
    setGridBounds(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle dimension change
  const handleDimensionChange = useCallback(() => {
    if (!selectedRoom || !editingDimension.width && !editingDimension.height) return;
    
    const room = rooms.find(r => r.id === selectedRoom.id);
    if (!room) return;
    
    const width = parseFloat(editingDimension.width);
    const height = parseFloat(editingDimension.height);
    
    if (!isNaN(width) && width > 0) {
      // 가로를 입력한 경우, 면적에 맞춰 세로 계산
      const newHeight = room.area / width;
      room.width = width * SCALE_FACTOR;
      room.height = newHeight * SCALE_FACTOR;
    } else if (!isNaN(height) && height > 0) {
      // 세로를 입력한 경우, 면적에 맞춰 가로 계산
      const newWidth = room.area / height;
      room.width = newWidth * SCALE_FACTOR;
      room.height = height * SCALE_FACTOR;
    }
    
    // React 상태 업데이트
    setRooms([...rooms]);
    
    // 메뉴 닫기
    setShowDimensionEdit(false);
    setSelectedRoom(null);
    setEditingDimension({ width: '', height: '' });
    
    // Simulation 재시작
    if (simulationRef.current) {
      simulationRef.current.alpha(0.3).restart();
    }
  }, [selectedRoom, editingDimension, rooms]);

  // Delete room handler
  const handleDeleteRoom = useCallback((e) => {
    if (e) e.stopPropagation();
    if (!selectedRoom) return;
    
    const newRooms = rooms.filter(r => r.id !== selectedRoom.id);
    const newLinks = links.filter(l => {
      const sourceId = l.source?.id || l.source;
      const targetId = l.target?.id || l.target;
      return sourceId !== selectedRoom.id && targetId !== selectedRoom.id;
    });
    
    setRooms(newRooms);
    setLinks(newLinks);
    setPinnedRooms(prev => {
      const newSet = new Set(prev);
      newSet.delete(selectedRoom.id);
      return newSet;
    });
    
    setShowDeleteConfirm(false);
    setShowDeleteMenu(false);
    setSelectedRoom(null);
  }, [selectedRoom, rooms, links]);

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-80 bg-white shadow-lg p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-6">Force-Directed 평면 배치</h1>
        
        <div className="mb-6 border-b pb-4">
          <h3 className="text-sm font-medium mb-3">데이터 파일 업로드</h3>
          
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">연결성 매트릭스 (CSV)</label>
            <input
              ref={matrixFileRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleCSVUpload(e, 'matrix')}
              className="w-full p-2 border rounded text-sm"
            />
          </div>
          
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">실 정보 (CSV)</label>
            <input
              ref={roomFileRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleCSVUpload(e, 'room')}
              className="w-full p-2 border rounded text-sm"
            />
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">대지 경계 (GeoJSON)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.geojson"
            onChange={handleFileUpload}
            className="w-full p-2 border rounded text-sm"
          />
          {boundary && (
            <button
              onClick={clearBoundary}
              className="mt-2 text-sm text-red-500 hover:underline"
            >
              경계 제거
            </button>
          )}
        </div>

        <div className="mb-6 border-b pb-4">
          <h3 className="text-sm font-medium mb-3">그리드 설정</h3>
          
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">
              그리드 간격 (m) - 최소 {MIN_GRID_SPACING}m
            </label>
            <input
              type="number"
              min={MIN_GRID_SPACING}
              step="0.1"
              value={gridSpacing}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (value >= MIN_GRID_SPACING) {
                  setGridSpacing(value);
                }
              }}
              className="w-full p-2 border rounded text-sm"
              disabled={!boundary}
            />
          </div>
          
          <label className="flex items-center mb-2">
            <input 
              type="checkbox" 
              checked={showGrid} 
              onChange={(e) => setShowGrid(e.target.checked)}
              className="mr-2"
              disabled={!boundary}
            />
            <span className="text-sm">그리드 표시</span>
          </label>

          <label className="flex items-center mb-2">
            <input 
              type="checkbox" 
              checked={snapToGridEnabled} 
              onChange={(e) => setSnapToGridEnabled(e.target.checked)}
              className="mr-2"
              disabled={!boundary}
            />
            <span className="text-sm">그리드에 스냅</span>
          </label>

          <label className="flex items-center">
            <input 
              type="checkbox" 
              checked={snapRoomSizes} 
              onChange={(e) => setSnapRoomSizes(e.target.checked)}
              className="mr-2"
              disabled={!boundary}
            />
            <span className="text-sm">방 크기 그리드 맞춤</span>
          </label>
          
          {!boundary && (
            <p className="text-xs text-gray-500 mt-2">
              * 그리드를 사용하려면 먼저 대지 경계를 설정하세요
            </p>
          )}
        </div>

        <div className="mb-6 border-b pb-4">
          <h3 className="text-sm font-medium mb-3">시뮬레이션 설정</h3>
          
          <div className="mb-3">
            <label className="block text-xs text-gray-600 mb-1">
              연결 강도: {linkStrength.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={linkStrength}
              onChange={(e) => {
                setLinkStrength(parseFloat(e.target.value));
                if (simulationRef.current) {
                  simulationRef.current.alpha(0.3).restart();
                }
              }}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>약함</span>
              <span>기본(0.8)</span>
              <span>강함</span>
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-xs text-gray-600 mb-2">최적화 모드</label>
            <div className="space-y-1">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="optimizationMode"
                  value="conservative"
                  checked={optimizationMode === 'conservative'}
                  onChange={(e) => setOptimizationMode(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">보수적 (안전하지만 제한적)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="optimizationMode"
                  value="aggressive"
                  checked={optimizationMode === 'aggressive'}
                  onChange={(e) => setOptimizationMode(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">공격적 (빠르지만 불안정)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="optimizationMode"
                  value="smart"
                  checked={optimizationMode === 'smart'}
                  onChange={(e) => setOptimizationMode(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm">스마트 (3단계 최적화) ⭐</span>
              </label>
            </div>
          </div>
        </div>

        {adjustmentWarnings.length > 0 ? (
          <AdjustmentWarnings warnings={adjustmentWarnings} />
        ) : null}

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">층 선택</label>
          <select 
            value={selectedFloor} 
            onChange={(e) => setSelectedFloor(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="all">전체</option>
            <option value="Core(CR)">Core(CR)</option>
            <option value="Basement 1(B1)">Basement 1(B1)</option>
            <option value="Floor 1(F1)">Floor 1(F1)</option>
            <option value="Floor 2(F2)">Floor 2(F2)</option>
          </select>
        </div>

        <RoomStats stats={stats} connectionSatisfaction={connectionSatisfaction} />

        {isOptimizing ? (
          <OptimizationProgress progress={optimizationProgress} phase={optimizationPhase} mode={optimizationMode} />
        ) : null}

        <div className="space-y-4">
          <label className="flex items-center">
            <input 
              type="checkbox" 
              checked={showConnections} 
              onChange={(e) => setShowConnections(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">연결선 표시</span>
          </label>

          <button 
            onClick={simpleOptimizeLayout}
            disabled={isOptimizing}
            className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition disabled:bg-gray-300"
          >
            재배치 실행
          </button>
          
          <button 
            onClick={progressiveOptimization}
            disabled={isOptimizing}
            className="w-full py-2 bg-green-500 text-white rounded hover:bg-green-600 transition disabled:bg-gray-300"
          >
            {isOptimizing ? '최적화 중...' : '점진적 최적화 (목표: 100%)'}
          </button>
          
          {isOptimizing && (
            <button 
              onClick={cancelOptimization}
              className="w-full py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
            >
              최적화 취소
            </button>
          )}
        </div>

        <div className="mt-6">
          <h3 className="font-semibold mb-2">사용 방법</h3>
          <ul className="text-sm space-y-1 text-gray-600">
            <li>• 실을 드래그하여 이동</li>
            <li>• 더블클릭으로 위치 고정/해제</li>
            <li>• 우클릭으로 실 삭제</li>
            <li>• 마우스 휠로 확대/축소</li>
            <li>• 배경 드래그로 화면 이동</li>
            <li>• GeoJSON 업로드로 대지 경계 설정</li>
            <li>• 그리드로 정렬된 배치</li>
          </ul>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold mb-2">범례</h3>
          <div className="space-y-1 text-sm">
            <div className="font-semibold">연결 만족도:</div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{backgroundColor: "#90EE90"}}></div>
              <span>100% (벽면 접촉)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{backgroundColor: "#FFEB3B"}}></div>
              <span>50-99% (부분 접촉)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{backgroundColor: "#FF6B6B"}}></div>
              <span>0-49% (미접촉)</span>
            </div>
            
            <div className="font-semibold mt-3">연결 유형:</div>
            <div className="flex items-center">
              <div className="w-4 h-0 border-t-2 border-dashed mr-2" style={{borderColor: "#4A90E2"}}></div>
              <span>시각적 연결</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-0 border-t-2 mr-2" style={{borderColor: "#E94B3C"}}></div>
              <span>물리적 연결</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-0 border-t-2 mr-2" style={{borderColor: "#7B68EE"}}></div>
              <span>시각적+물리적</span>
            </div>
            
            <div className="flex items-center mt-3 pt-3 border-t">
              <div className="w-4 h-4 border-2 border-red-500 rounded mr-2"></div>
              <span>고정된 실</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 border-2 border-dashed border-red-500 rounded mr-2"></div>
              <span>면적 조정 경고</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            <p>* 인접: 두 방의 벽면이 맞닿은 상태</p>
            <p>* 허용 오차: {EDGE_TOLERANCE}px</p>
            {gridBounds && <p>* 그리드 간격: {gridSpacing}m</p>}
            <p>* 면적 허용 오차: ±{(AREA_TOLERANCE * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="bg-white rounded-lg shadow-lg h-full relative">
          <svg ref={svgRef} className="w-full h-full"></svg>
          
          {showDeleteMenu && selectedRoom && !showDeleteConfirm && (
            <div 
              className="absolute bg-white border border-gray-300 shadow-lg rounded p-2"
              style={{ 
                left: `${menuPosition.x}px`, 
                top: `${menuPosition.y}px`,
                zIndex: 1000
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="text-red-600 hover:bg-red-50 px-3 py-1 rounded w-full text-left text-sm mb-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
              >
                삭제: {selectedRoom.name || selectedRoom.id}
              </button>
              <button
                className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded w-full text-left text-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDimensionEdit(true);
                  setEditingDimension({ 
                    width: (selectedRoom.width / SCALE_FACTOR).toFixed(1), 
                    height: (selectedRoom.height / SCALE_FACTOR).toFixed(1) 
                  });
                }}
              >
                크기 조정: {(selectedRoom.width / SCALE_FACTOR).toFixed(1)}m × {(selectedRoom.height / SCALE_FACTOR).toFixed(1)}m
              </button>
            </div>
          )}
          
          {showDeleteConfirm && selectedRoom && (
            <div 
              className="absolute bg-white border-2 border-red-300 shadow-xl rounded-lg p-4"
              style={{ 
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1001,
                minWidth: '300px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-lg mb-2">삭제 확인</h3>
              <p className="mb-4">"{selectedRoom.name || selectedRoom.id}" 실을 삭제하시겠습니까?</p>
              <div className="flex gap-2 justify-end">
                <button
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setShowDeleteMenu(false);
                    setSelectedRoom(null);
                  }}
                >
                  취소
                </button>
                <button
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                  onClick={handleDeleteRoom}
                >
                  삭제
                </button>
              </div>
            </div>
          )}
          
          {showDimensionEdit && selectedRoom && (
            <div 
              className="absolute bg-white border-2 border-blue-300 shadow-xl rounded-lg p-4"
              style={{ 
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1001,
                minWidth: '350px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-lg mb-2">크기 조정</h3>
              <p className="text-sm text-gray-600 mb-3">
                {selectedRoom.name || selectedRoom.id} (면적: {selectedRoom.area}㎡)
              </p>
              <p className="text-xs text-gray-500 mb-4">
                가로 또는 세로 중 하나만 입력하면 면적에 맞춰 자동 계산됩니다.
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">가로 (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={editingDimension.width}
                    onChange={(e) => setEditingDimension({ width: e.target.value, height: '' })}
                    onFocus={() => setEditingDimension({ ...editingDimension, height: '' })}
                    className="w-full p-2 border rounded"
                    placeholder={`현재: ${(selectedRoom.width / SCALE_FACTOR).toFixed(1)}m`}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">세로 (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={editingDimension.height}
                    onChange={(e) => setEditingDimension({ width: '', height: e.target.value })}
                    onFocus={() => setEditingDimension({ width: '', ...editingDimension })}
                    className="w-full p-2 border rounded"
                    placeholder={`현재: ${(selectedRoom.height / SCALE_FACTOR).toFixed(1)}m`}
                  />
                </div>
                
                {editingDimension.width && (
                  <p className="text-sm text-blue-600">
                    → 세로: {(selectedRoom.area / parseFloat(editingDimension.width)).toFixed(1)}m
                  </p>
                )}
                {editingDimension.height && (
                  <p className="text-sm text-blue-600">
                    → 가로: {(selectedRoom.area / parseFloat(editingDimension.height)).toFixed(1)}m
                  </p>
                )}
              </div>
              
              <div className="flex gap-2 justify-end mt-4">
                <button
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                  onClick={() => {
                    setShowDimensionEdit(false);
                    setSelectedRoom(null);
                    setEditingDimension({ width: '', height: '' });
                  }}
                >
                  취소
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                  onClick={handleDimensionChange}
                  disabled={!editingDimension.width && !editingDimension.height}
                >
                  적용
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
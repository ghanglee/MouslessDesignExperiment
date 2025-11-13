import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import Papa from 'papaparse';

export default function AdjacencyMatrixEditor() {
  const [matrix, setMatrix] = useState([]);
  const [nodeLabels, setNodeLabels] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [draggedFile, setDraggedFile] = useState(false);
  const [forceStrength, setForceStrength] = useState(-300);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [focusedCell, setFocusedCell] = useState(null);
  const [symmetricMode, setSymmetricMode] = useState(true);
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const matrixInputRefs = useRef([]);

  // 초기 샘플 데이터
  useEffect(() => {
    const sampleMatrix = [
      [0, 1, 2, 3, 4],
      [1, 0, 3, 4, 5],
      [2, 3, 0, 5, 6],
      [3, 4, 5, 0, 1],
      [4, 5, 6, 1, 0]
    ];
    const sampleLabels = ['Node A', 'Node B', 'Node C', 'Node D', 'Node E'];
    processMatrix(sampleMatrix, sampleLabels);
  }, []);

  // 노드 라벨 파싱 함수 (Name%Floor 형식)
  const parseNodeLabel = (label) => {
    if (label && label.includes('%')) {
      const parts = label.split('%');
      return {
        name: parts[0],
        floor: parts[1],
        full: label
      };
    }
    return {
      name: label,
      floor: null,
      full: label
    };
  };

  // 행렬로부터 노드와 링크 계산
  const processMatrix = (mat, labels = null) => {
    if (!mat || mat.length === 0) return;
    
    const n = mat.length;
    
    // 라벨이 없으면 기본값 사용
    const finalLabels = labels || Array.from({length: n}, (_, i) => String.fromCharCode(65 + i));
    setNodeLabels(finalLabels);
    
    // 노드 생성 및 degree 계산
    const newNodes = [];
    for (let i = 0; i < n; i++) {
      let degree = 0;
      for (let j = 0; j < n; j++) {
        if (i !== j && (mat[i][j] > 0 || mat[j][i] > 0)) degree++;
      }
      newNodes.push({
        id: i,
        label: finalLabels[i],
        degree: degree
      });
    }
    
    // degree에 따른 색상 계산
    const maxDegree = Math.max(...newNodes.map(n => n.degree));
    const minDegree = Math.min(...newNodes.map(n => n.degree));
    
    newNodes.forEach(node => {
      const ratio = maxDegree === minDegree ? 0 : 
        (node.degree - minDegree) / (maxDegree - minDegree);
      // 파란색(rgb(0,0,255))에서 빨간색(rgb(255,0,0))으로
      const r = Math.round(255 * ratio);
      const b = Math.round(255 * (1 - ratio));
      node.color = `rgb(${r},0,${b})`;
    });
    
    // 링크 생성 (비대칭 행렬 지원)
    const newLinks = [];
    const processedPairs = new Set(); // 중복 방지
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue; // 대각선 제외
        
        // 이미 처리된 쌍인지 확인
        const pairKey = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (processedPairs.has(pairKey)) continue;
        
        // 양방향 중 최대값 사용
        const value1 = mat[i][j];
        const value2 = mat[j][i];
        const value = Math.max(value1, value2);
        
        if (value > 0) {
          processedPairs.add(pairKey);
          
          let style = {};
          switch(value) {
            case 1:
              style = { stroke: '#3b82f6', strokeWidth: 0.8, dashArray: '5,5' }; // blue
              break;
            case 2:
              style = { stroke: '#10b981', strokeWidth: 1.0, dashArray: 'none' }; // green
              break;
            case 3:
              style = { stroke: '#f59e0b', strokeWidth: 1.2, dashArray: 'none' }; // amber
              break;
            case 4:
              style = { stroke: '#ef4444', strokeWidth: 1.4, dashArray: 'none' }; // red
              break;
            case 5:
              style = { stroke: '#8b5cf6', strokeWidth: 1.6, dashArray: 'none' }; // purple
              break;
            case 6:
              style = { stroke: '#ec4899', strokeWidth: 1.8, dashArray: 'none' }; // pink
              break;
            default:
              style = { stroke: '#6b7280', strokeWidth: 0.8, dashArray: 'none' }; // gray
          }
          
          // 비대칭인 경우 표시
          const isAsymmetric = value1 !== value2;
          
          newLinks.push({
            source: i < j ? i : j,
            target: i < j ? j : i,
            value: value,
            asymmetric: isAsymmetric,
            value1: i < j ? value1 : value2,
            value2: i < j ? value2 : value1,
            ...style
          });
        }
      }
    }
    
    console.log(`생성된 링크 수: ${newLinks.length}`);
    
    setNodes(newNodes);
    setLinks(newLinks);
    setMatrix(mat);
  };

  // CSV 파일 처리
  const handleFileUpload = (file) => {
    Papa.parse(file, {
      complete: (result) => {
        const data = result.data;
        console.log('원본 데이터 행 수:', data.length);
        
        // 빈 행 제거 (더 엄격한 필터링)
        const filteredData = data.filter(row => {
          // 첫 번째 셀(라벨)이 있거나, 두 번째 이후 셀 중 하나라도 값이 있는 경우만 유효
          return row[0] !== '' || row.slice(1).some(cell => cell !== '' && cell !== undefined);
        });
        
        console.log('필터링 후 데이터 행 수:', filteredData.length);
        
        if (filteredData.length < 2) {
          alert('유효한 데이터가 없습니다.');
          return;
        }
        
        // 첫 번째 행에서 노드 이름 추출 (첫 번째 셀 제외)
        const headerRow = filteredData[0];
        const labels = headerRow.slice(1).filter(label => label !== '');
        console.log('라벨 개수:', labels.length);
        
        // 데이터 행에서 행렬 추출 (각 행의 첫 번째 셀 제외)
        const parsedMatrix = [];
        for (let i = 1; i <= labels.length && i < filteredData.length; i++) {
          const row = filteredData[i];
          if (row && row.length > 1) {
            // 라벨 개수만큼만 데이터를 가져옴
            const matrixRow = row.slice(1, labels.length + 1).map(cell => {
              const value = parseInt(cell);
              return isNaN(value) ? 0 : value;
            });
            parsedMatrix.push(matrixRow);
          }
        }
        
        console.log('파싱된 행렬 크기:', parsedMatrix.length, 'x', parsedMatrix[0]?.length);
        
        // 정방행렬 확인
        const n = labels.length;
        if (parsedMatrix.length !== n) {
          alert(`행렬 크기가 맞지 않습니다. 라벨: ${n}개, 데이터 행: ${parsedMatrix.length}개`);
          return;
        }
        
        // 각 행의 길이 확인 및 조정
        for (let i = 0; i < n; i++) {
          if (parsedMatrix[i].length !== n) {
            console.warn(`행 ${i}의 길이가 ${parsedMatrix[i].length}입니다. ${n}으로 조정합니다.`);
            // 길이가 짧으면 0으로 채우고, 길면 자름
            parsedMatrix[i] = parsedMatrix[i].slice(0, n);
            while (parsedMatrix[i].length < n) {
              parsedMatrix[i].push(0);
            }
          }
        }
        
        // 대각선 요소를 0으로 설정
        for (let i = 0; i < n; i++) {
          parsedMatrix[i][i] = 0;
        }
        
        // 대칭 여부 확인
        let isSymmetric = true;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (parsedMatrix[i][j] !== parsedMatrix[j][i]) {
              isSymmetric = false;
              break;
            }
          }
          if (!isSymmetric) break;
        }
        console.log('행렬 대칭 여부:', isSymmetric);
        
        processMatrix(parsedMatrix, labels);
      },
      error: (error) => {
        alert('CSV 파일 읽기 오류: ' + error.message);
      }
    });
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e) => {
    e.preventDefault();
    setDraggedFile(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDraggedFile(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDraggedFile(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'text/csv') {
      handleFileUpload(file);
    } else {
      alert('CSV 파일만 업로드 가능합니다.');
    }
  };

  // 행렬 셀 값 변경
  const handleCellChange = (i, j, value) => {
    const newValue = parseInt(value) || 0;
    if (newValue < 0 || newValue > 6) {
      alert('0-6 사이의 값만 입력 가능합니다.');
      return;
    }
    
    const newMatrix = matrix.map(row => [...row]);
    newMatrix[i][j] = newValue;
    
    // 대칭 모드일 때만 대칭 위치도 같은 값으로 설정
    if (symmetricMode && i !== j) {
      newMatrix[j][i] = newValue;
    }
    
    setMatrix(newMatrix);
  };

  // 업데이트 버튼 클릭
  const handleUpdate = () => {
    processMatrix(matrix, nodeLabels);
  };

  // CSV 다운로드
  const handleDownload = () => {
    // 헤더 행 생성
    const header = ['', ...nodeLabels].join(',');
    
    // 데이터 행 생성
    const rows = matrix.map((row, i) => {
      return [nodeLabels[i], ...row].join(',');
    });
    
    // CSV 콘텐츠 생성
    const content = [header, ...rows].join('\n');
    setCsvContent(content);
    setShowCsvModal(true);
  };

  // CSV 복사
  const handleCopyCSV = () => {
    navigator.clipboard.writeText(csvContent).then(() => {
      alert('CSV 내용이 클립보드에 복사되었습니다!');
    }).catch(err => {
      console.error('복사 실패:', err);
      // 폴백: 텍스트 선택
      const textarea = document.getElementById('csv-textarea');
      if (textarea) {
        textarea.select();
        document.execCommand('copy');
        alert('CSV 내용이 복사되었습니다!');
      }
    });
  };

  // Force strength 변경 핸들러
  const handleForceChange = (value) => {
    setForceStrength(value);
    if (simulationRef.current) {
      simulationRef.current.force('charge', d3.forceManyBody().strength(value));
      simulationRef.current.alpha(0.3).restart();
    }
  };

  // 노드 클릭 핸들러
  const handleNodeClick = (nodeIndex) => {
    // 해당 행의 첫 번째 편집 가능한 입력 필드로 포커스
    const firstEditableIndex = nodeIndex === 0 ? 1 : 0;
    const inputRef = matrixInputRefs.current[nodeIndex * matrix.length + firstEditableIndex];
    if (inputRef) {
      inputRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputRef.focus();
      setFocusedCell({ row: nodeIndex, col: firstEditableIndex });
    }
  };

  // 링크 클릭 핸들러
  const handleLinkClick = (sourceId, targetId) => {
    // source가 더 작은 값이 행(i), target이 열(j)
    const i = Math.min(sourceId, targetId);
    const j = Math.max(sourceId, targetId);
    const inputRef = matrixInputRefs.current[i * matrix.length + j];
    if (inputRef) {
      inputRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputRef.focus();
      setFocusedCell({ row: i, col: j });
    }
  };

  // D3.js 그래프 렌더링
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // 컨테이너의 실제 너비 가져오기
    const containerWidth = svgRef.current.parentElement.clientWidth;
    const width = containerWidth;
    const height = Math.min(containerWidth * 0.875, 700); // 비율 유지 (700/800 = 0.875)
    
    // 메인 그룹 생성 (zoom 적용을 위해)
    const g = svg.append('g');
    
    // Zoom 기능 추가
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4]) // 최소 0.1배, 최대 4배
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);
    
    // 더블클릭으로 초기화
    svg.on('dblclick.zoom', () => {
      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity
      );
    });
    
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(forceStrength))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // 시뮬레이션 참조 저장
    simulationRef.current = simulation;
    
    // 윈도우 리사이즈 핸들러
    const handleResize = () => {
      if (svgRef.current) {
        const newWidth = svgRef.current.parentElement.clientWidth;
        const newHeight = Math.min(newWidth * 0.875, 700);
        
        svg.attr('viewBox', `0 0 ${newWidth} ${newHeight}`);
        
        simulation
          .force('center', d3.forceCenter(newWidth / 2, newHeight / 2))
          .alpha(0.3)
          .restart();
      }
    };
    
    window.addEventListener('resize', handleResize);

    // 링크 그리기
    const linkGroup = g.append('g');
    
    // 클릭 영역을 위한 투명한 굵은 선
    const linkHitArea = linkGroup.selectAll('.link-hit-area')
      .data(links)
      .enter().append('line')
      .attr('class', 'link-hit-area')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 10)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        handleLinkClick(d.source.id, d.target.id);
      });

    // 실제 보이는 링크
    const link = linkGroup.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', d => d.stroke)
      .attr('stroke-width', d => d.strokeWidth)
      .attr('stroke-dasharray', d => d.dashArray)
      .style('pointer-events', 'none');

    // 링크 텍스트 (연결 값 표시)
    const linkTextGroup = g.append('g');
    const linkText = linkTextGroup.selectAll('.link-text')
      .data(links)
      .enter().append('text')
      .attr('class', 'link-text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '300')
      .attr('fill', '#374151')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .attr('paint-order', 'stroke')
      .style('pointer-events', 'none')
      .text(d => {
        // 비대칭인 경우 양방향 값 표시
        if (d.asymmetric && d.value1 > 0 && d.value2 > 0) {
          return `${d.value1}/${d.value2}`;
        }
        return d.value;
      });

    // 노드 그리기
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    node.append('circle')
      .attr('r', 25)  // 두 줄 텍스트를 위해 크기 증가
      .attr('fill', d => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        handleNodeClick(d.id);
      });

    // 노드 텍스트 (두 줄 표시)
    const nodeText = node.append('text')
      .attr('text-anchor', 'middle')
      .attr('fill', 'black')
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .style('font-weight', 'bold')
      .style('font-size', '12px')
      .style('pointer-events', 'none');

    // 라벨 파싱 및 표시
    nodeText.each(function(d) {
      const labelInfo = parseNodeLabel(d.label);
      const text = d3.select(this);
      
      if (labelInfo.floor) {
        // 두 줄로 표시
        text.append('tspan')
          .text(labelInfo.name)
          .attr('x', 0)
          .attr('dy', '-0.3em');
        
        text.append('tspan')
          .text(labelInfo.floor)
          .attr('x', 0)
          .attr('dy', '1.2em');
      } else {
        // 한 줄로 표시
        text.append('tspan')
          .text(labelInfo.name)
          .attr('dy', '0.35em');
      }
    });

    // 툴팁
    node.append('title')
      .text(d => `${d.label}: ${d.degree} connections`);

    simulation.on('tick', () => {
      linkHitArea
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
        
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkText
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
      simulationRef.current = null;
      window.removeEventListener('resize', handleResize);
    };
  }, [nodes, links, forceStrength]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6">Interactive Adjacency Matrix Editor</h1>
        
        {/* 파일 업로드 영역 */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 mb-6 text-center cursor-pointer transition-colors ${
            draggedFile ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
          />
          <p className="text-gray-600">CSV 파일을 드래그하거나 클릭하여 업로드하세요</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* 왼쪽: 행렬 편집기 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">행렬 편집기</h2>
              
              {/* 대칭 모드 토글 */}
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={symmetricMode}
                  onChange={(e) => setSymmetricMode(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">대칭 모드</span>
                <span className="ml-1 text-xs text-gray-500">
                  {symmetricMode ? '(A→B = B→A)' : '(A→B ≠ B→A)'}
                </span>
              </label>
            </div>
            
            {/* 현재 선택된 셀 정보 표시 */}
            {focusedCell && (
              <div className="mb-4 p-2 bg-blue-50 rounded text-sm">
                <span className="font-semibold">선택된 셀:</span> {nodeLabels[focusedCell.row]} → {nodeLabels[focusedCell.col]}
                {matrix[focusedCell.row] && matrix[focusedCell.row][focusedCell.col] !== undefined && (
                  <span className="ml-2">
                    (값: <span className="font-mono">{matrix[focusedCell.row][focusedCell.col]}</span>)
                  </span>
                )}
              </div>
            )}
            
            {/* 행렬 크기 정보 */}
            <div className="mb-2 text-sm text-gray-600">
              행렬 크기: {matrix.length} × {matrix[0]?.length || 0}
            </div>
            
            {/* 테이블 컨테이너 */}
            <div 
              className="relative overflow-auto border border-gray-200 rounded"
              style={{
                maxHeight: '500px',
                scrollbarWidth: 'thin',
                scrollbarColor: '#888 #f1f1f1'
              }}
            >
              <table className="relative">
                <thead>
                  <tr>
                    <th 
                      className="sticky top-0 left-0 z-20 p-2 bg-gray-100 border-r border-b border-gray-300"
                      style={{ minWidth: '100px' }}
                    ></th>
                    {matrix[0]?.map((_, j) => (
                      <th 
                        key={j} 
                        className="sticky top-0 z-10 p-2 text-center font-medium bg-gray-100 border-b border-gray-300"
                        style={{ minWidth: '80px' }}
                      >
                        {(() => {
                          const label = parseNodeLabel(nodeLabels[j] || String.fromCharCode(65 + j));
                          if (label.floor) {
                            return (
                              <div className="leading-tight">
                                <div className="text-xs">{label.name}</div>
                                <div className="text-xs text-gray-600">{label.floor}</div>
                              </div>
                            );
                          }
                          return <div className="text-xs">{label.name}</div>;
                        })()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      <td 
                        className="sticky left-0 z-10 p-2 text-center font-medium bg-gray-100 border-r border-gray-300"
                        style={{ minWidth: '100px' }}
                      >
                        {(() => {
                          const label = parseNodeLabel(nodeLabels[i] || String.fromCharCode(65 + i));
                          if (label.floor) {
                            return (
                              <div className="leading-tight">
                                <div className="text-xs">{label.name}</div>
                                <div className="text-xs text-gray-600">{label.floor}</div>
                              </div>
                            );
                          }
                          return <div className="text-xs">{label.name}</div>;
                        })()}
                      </td>
                      {row.map((cell, j) => (
                        <td key={j} className="p-1 border border-gray-200">
                          <input
                            type="number"
                            min="0"
                            max="6"
                            value={cell}
                            onChange={(e) => handleCellChange(i, j, e.target.value)}
                            onFocus={() => setFocusedCell({ row: i, col: j })}
                            onBlur={() => setFocusedCell(null)}
                            onKeyDown={(e) => {
                              // 방향키로 셀 이동
                              let newRow = i, newCol = j;
                              switch(e.key) {
                                case 'ArrowUp':
                                  if (i > 0) newRow = i - 1;
                                  break;
                                case 'ArrowDown':
                                  if (i < matrix.length - 1) newRow = i + 1;
                                  break;
                                case 'ArrowLeft':
                                  if (j > 0) newCol = j - 1;
                                  break;
                                case 'ArrowRight':
                                  if (j < matrix[0].length - 1) newCol = j + 1;
                                  break;
                                case 'Enter':
                                  // Enter 키로 다음 행으로 이동
                                  if (i < matrix.length - 1) {
                                    newRow = i + 1;
                                  }
                                  break;
                                default:
                                  return; // 다른 키는 무시
                              }
                              
                              // 대각선 셀은 건너뛰기
                              if (newRow === newCol && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                                newCol = e.key === 'ArrowLeft' ? newCol - 1 : newCol + 1;
                                if (newCol < 0) newCol = 0;
                                if (newCol >= matrix[0].length) newCol = matrix[0].length - 1;
                              }
                              
                              if (newRow !== i || newCol !== j) {
                                e.preventDefault();
                                const nextInput = matrixInputRefs.current[newRow * matrix.length + newCol];
                                if (nextInput && !nextInput.disabled) {
                                  nextInput.focus();
                                }
                              }
                            }}
                            disabled={i === j}
                            ref={el => matrixInputRefs.current[i * matrix.length + j] = el}
                            className={`w-12 h-12 text-center border rounded transition-colors ${
                              i === j 
                                ? 'bg-gray-100 cursor-not-allowed' 
                                : focusedCell?.row === i || focusedCell?.col === j
                                  ? 'border-blue-400 bg-blue-50'
                                  : 'border-gray-300 hover:border-gray-400'
                            }`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 space-y-2">
              <div className="text-sm text-gray-600">
                <p><span className="font-semibold">0:</span> 연결 없음</p>
                <p><span className="font-semibold">1:</span> 약한 연결 (파란색 점선)</p>
                <p><span className="font-semibold">2:</span> 보통 연결 (녹색 실선)</p>
                <p><span className="font-semibold">3:</span> 중간 연결 (주황색 실선)</p>
                <p><span className="font-semibold">4:</span> 강한 연결 (빨간색 실선)</p>
                <p><span className="font-semibold">5:</span> 매우 강한 연결 (보라색 실선)</p>
                <p><span className="font-semibold">6:</span> 최강 연결 (분홍색 실선)</p>
                <p className="mt-2 text-xs italic">* 비대칭 연결은 "A→B/B→A" 형식으로 표시됩니다</p>
              </div>
              
              <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                <p className="font-semibold mb-1">키보드 단축키:</p>
                <p>• 방향키: 셀 간 이동</p>
                <p>• Enter: 다음 행으로 이동</p>
                <p>• Tab: 다음 셀로 이동</p>
              </div>
              
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleUpdate}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Update
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* 오른쪽: 그래프 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Connectivity Graph</h2>
            
            {/* Force Strength 조절 슬라이더 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Force Strength: {forceStrength}
              </label>
              <input
                type="range"
                min="-1000"
                max="-50"
                value={forceStrength}
                onChange={(e) => handleForceChange(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Loose (-1000)</span>
                <span>Tight (-50)</span>
              </div>
            </div>
            
            <svg
              ref={svgRef}
              width="100%"
              height="auto"
              viewBox={`0 0 ${800} ${700}`}
              preserveAspectRatio="xMidYMid meet"
              className="border border-gray-200 rounded w-full"
            />
            <div className="mt-4 text-sm text-gray-600">
              <p className="font-semibold">노드 색상:</p>
              <p>파란색 (최소 연결) → 빨간색 (최대 연결)</p>
              <p className="mt-2 font-semibold">줌 기능:</p>
              <p>마우스 휠: 확대/축소</p>
              <p>더블클릭: 초기화</p>
              <p className="mt-2 font-semibold">노드 클릭:</p>
              <p>해당 행의 행렬로 이동</p>
              <p className="mt-2 font-semibold">연결선 클릭:</p>
              <p>해당 연결 값으로 이동</p>
            </div>
          </div>
        </div>
        
        {/* CSV 모달 */}
        {showCsvModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold">CSV 내용</h3>
                <p className="text-sm text-gray-600 mt-1">아래 내용을 복사하여 사용하세요</p>
              </div>
              
              <div className="p-4 flex-1 overflow-auto">
                <textarea
                  id="csv-textarea"
                  value={csvContent}
                  readOnly
                  className="w-full h-64 p-2 border rounded font-mono text-sm"
                  onClick={(e) => e.target.select()}
                />
              </div>
              
              <div className="p-4 border-t flex gap-2 justify-end">
                <button
                  onClick={handleCopyCSV}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  복사하기
                </button>
                <button
                  onClick={() => setShowCsvModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
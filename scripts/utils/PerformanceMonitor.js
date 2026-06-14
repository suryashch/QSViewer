import * as THREE from 'three';

export class PerformanceMonitor {
    constructor() {
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
        this.drawCalls = 0;
        this.triangles = 0;
        this.activeLODLevels = new Map();
        
        this.createUI();
    }

    createUI() {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            // background: rgba(19, 20, 28, 0.85);
            backdrop-filter: blur(10px);
            color: rgb(65, 65, 65);
            font-family: "Roboto Mono", monospace;
            font-size: 10px;
            padding: 10px;
            border-radius: 4px;
            z-index: 1000;
        `;
        container.id = 'perf-monitor';
        document.body.appendChild(container);
    }

    update(renderer, scene) {
        this.frameCount++;
        const currentTime = performance.now();
        
        // Update FPS every second
        if (currentTime >= this.lastTime + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
        
        // Get renderer info
        const info = renderer.info;
        // console.log(info)
        this.drawCalls = info.render.calls;
        this.triangles = info.render.triangles;
        
        // Track LOD levels
        this.trackLODLevels(scene);
        
        this.render();
    }

    trackLODLevels(scene) {
        this.activeLODLevels.clear();
        
    //     scene.traverse((child) => {
    //         if (child instanceof THREE.LOD) {
    //             const level = child.getCurrentLevel();
    //             const count = this.activeLODLevels.get(level) || 0;
    //             this.activeLODLevels.set(level, count + 1);
    //         }
    //     });
    }

    render() {
        const container = document.getElementById('perf-monitor');
        if (!container) return;
        
        const lodInfo = Array.from(this.activeLODLevels.entries())
            .map(([level, count]) => `LOD${level}: ${count}`)
            .join(' | ');
        
        container.innerHTML = `
            <div>FPS: ${this.fps}</div>
            <div>Draw Calls: ${this.drawCalls.toLocaleString()}</div>
            <div>Triangles: ${this.triangles.toLocaleString()}</div>
            <div>Memory: ${(performance.memory?.usedJSHeapSize / 1048576).toFixed(1)} MB</div>
        `;
    }
}
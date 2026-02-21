'use client';

import { useEffect, useRef } from 'react';

export default function NeuralBackground({ isSuccess = false }: { isSuccess?: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Track isSuccess in a ref to use inside the animation loop
    const isSuccessRef = useRef(isSuccess);
    useEffect(() => {
        isSuccessRef.current = isSuccess;
    }, [isSuccess]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const particles: Particle[] = [];
        const particleCount = 100;
        const connectionDistance = 150;
        const mouseDistance = 200;

        let mouse = { x: 0, y: 0 };

        class Particle {
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;

            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 1.5;
                this.vy = (Math.random() - 0.5) * 1.5;
                this.size = Math.random() * 2 + 1;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;

                if (isSuccessRef.current) {
                    // Neural Sync: converge to center rapidly
                    const centerX = width / 2;
                    const centerY = height / 2;
                    const dxCentre = centerX - this.x;
                    const dyCentre = centerY - this.y;

                    this.vx += dxCentre * 0.005; // Pull towards center
                    this.vy += dyCentre * 0.005;

                    // Add friction so they don't overshoot infinitely
                    this.vx *= 0.95;
                    this.vy *= 0.95;

                    // Make them glow brighter
                    this.size = Math.min(this.size + 0.1, 4);
                } else {
                    // Mouse interaction (normal state)
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < mouseDistance) {
                        const forceDirectionX = dx / distance;
                        const forceDirectionY = dy / distance;
                        const force = (mouseDistance - distance) / mouseDistance;
                        const directionX = forceDirectionX * force * 0.5; // Push away a bit less
                        const directionY = forceDirectionY * force * 0.5;

                        // Or attract? Let's make it attract slightly for "neural connection" feel
                        // Actually, usually it pushes. Let's make it subtle attraction.
                        this.vx += directionX * 0.05;
                        this.vy += directionY * 0.05;
                    }
                }
            }

            draw() {
                if (!ctx) return;
                // If success, make them slightly greener/brighter to matrix feel
                ctx.fillStyle = isSuccessRef.current ? '#4ade80' : '#0080ff';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function init() {
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        }

        function animate() {
            if (!ctx || !canvas) return;
            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        ctx.beginPath();

                        if (isSuccessRef.current) {
                            ctx.strokeStyle = `rgba(74, 222, 128, ${1 - distance / connectionDistance})`; // Green/Glow links
                            ctx.lineWidth = 1.5;
                        } else {
                            ctx.strokeStyle = `rgba(0, 128, 255, ${1 - distance / connectionDistance})`; // Fade out blue lines
                            ctx.lineWidth = 1;
                        }

                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(animate);
        }

        init();
        animate();

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed top-0 left-0 w-full h-full -z-10 bg-[#02040a]"
        />
    );
}

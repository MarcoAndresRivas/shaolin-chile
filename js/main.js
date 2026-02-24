/**
 * Main JavaScript File
 * Handles UI interactions, navbar state, and scroll animations
 */

document.addEventListener('DOMContentLoaded', () => {

    // 1. Sticky Navbar Effect on Scroll
    const header = document.getElementById('header');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // 2. Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu');
    const navList = document.querySelector('.nav-list');

    mobileMenuBtn.addEventListener('click', () => {
        navList.classList.toggle('active');
        const icon = mobileMenuBtn.querySelector('i');
        if (navList.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-xmark');
        } else {
            icon.classList.remove('fa-xmark');
            icon.classList.add('fa-bars');
        }
    });

    // Close mobile menu when a link is clicked
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navList.classList.remove('active');
            const icon = mobileMenuBtn.querySelector('i');
            icon.classList.remove('fa-xmark');
            icon.classList.add('fa-bars');
        });
    });

    // 3. Scroll Reveal Animations utilizing Intersection Observer
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Stop observing once it's visible
            }
        });
    }, observerOptions);

    // Give animations to elements not currently in viewport initially
    const revealElements = document.querySelectorAll('.fade-in, .slide-up, .about-image, .discipline-card, .location-card, .info-item, .schedule-box');

    // Make sure we set the initial states for elements that aren't hardcoded in HTML
    document.querySelectorAll('.about-image, .schedule-box').forEach(el => { el.classList.add('fade-in'); });
    document.querySelectorAll('.info-item').forEach((el, index) => {
        el.classList.add('slide-up');
        el.style.transitionDelay = `${index * 0.15}s`;
    });
    document.querySelectorAll('.discipline-card, .location-card').forEach((el, index) => {
        el.classList.add('slide-up');
        el.style.transitionDelay = `${index * 0.2}s`;
    });

    // Observe all those elements
    document.querySelectorAll('.fade-in, .slide-up').forEach(el => {
        revealObserver.observe(el);
    });

    // 4. Handle Representative Registration Form
    const repForm = document.getElementById('form-representante');
    const repStatus = document.getElementById('rep-status');

    if (repForm) {
        repForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Get form values
            const formData = {
                repName: document.getElementById('rep-name').value,
                repEmail: document.getElementById('rep-email').value,
                repSede: document.getElementById('rep-sede').value,
                repMessage: document.getElementById('rep-message').value
            };

            repStatus.textContent = 'Enviando solicitud...';
            repStatus.className = 'form-status text-primary mt-2';

            try {
                // Determine API URL based on environment
                const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                    ? 'http://localhost:3000/api/register'
                    : 'https://shaolin-chile-backend.onrender.com/api/register';

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                const data = await response.json();

                if (response.ok) {
                    repStatus.textContent = data.message || 'Registro exitoso. Te contactaremos pronto.';
                    repStatus.className = 'form-status success mt-2';
                    repStatus.style.color = '#2ecc71'; // Green for success
                    repForm.reset();
                } else {
                    repStatus.textContent = data.error || 'Hubo un error al procesar tu solicitud.';
                    repStatus.className = 'form-status error mt-2';
                    repStatus.style.color = '#e74c3c'; // Red for error
                }
            } catch (error) {
                console.error('Error submitting form:', error);
                repStatus.textContent = 'Error de conexión. Asegúrate de que el servidor está en línea.';
                repStatus.className = 'form-status error mt-2';
                repStatus.style.color = '#e74c3c'; // Red for error
            }
        });
    }

    // 5. Handle Login Modal
    const loginBtn = document.getElementById('login-btn');
    const loginModal = document.getElementById('login-modal');
    const closeLoginBtn = document.getElementById('close-login');

    if (loginBtn && loginModal && closeLoginBtn) {
        // Open modal
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginModal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent scrolling bg
        });

        // Close modal (X button)
        closeLoginBtn.addEventListener('click', () => {
            loginModal.classList.remove('show');
            document.body.style.overflow = '';
        });

        // Close modal (clicking outside)
        window.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                loginModal.classList.remove('show');
                document.body.style.overflow = '';
            }
        });

        // Handle login submission
        const loginForm = document.getElementById('form-login');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const status = document.getElementById('login-status');

                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;

                status.textContent = 'Iniciando sesión...';
                status.className = 'form-status text-primary mt-2 text-center';
                status.style.color = 'var(--color-primary)';

                try {
                    const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                        ? 'http://localhost:3000/api/login'
                        : 'https://shaolin-chile-backend.onrender.com/api/login';

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        status.textContent = '¡Conectado! Redirigiendo...';
                        status.style.color = '#2ecc71';

                        // Save token
                        localStorage.setItem('jwt_token', data.token);
                        localStorage.setItem('user_rol', data.rol_id);
                        localStorage.setItem('user_nombre', data.nombre);

                        // Redirect based on role
                        setTimeout(() => {
                            if (data.rol_id === 1 || data.rol_id === 2) {
                                window.location.href = 'admin-dashboard.html';
                            } else if (data.rol_id === 5) {
                                window.location.href = 'alumno-dashboard.html';
                            } else {
                                alert('Dashboard en construcción para este rol.');
                            }
                        }, 1000);

                    } else {
                        status.textContent = data.error || 'Credenciales inválidas.';
                        status.style.color = '#e74c3c';
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    status.textContent = 'Error de conexión con el servidor.';
                    status.style.color = '#e74c3c';
                }
            });
        }
    }
});

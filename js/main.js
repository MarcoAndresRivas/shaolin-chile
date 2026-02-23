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
});

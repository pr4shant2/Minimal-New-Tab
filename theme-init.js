let savedTheme = localStorage.getItem('theme');
if (savedTheme === null) {
    savedTheme = 'dark';
    localStorage.setItem('theme', 'dark');
}
if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}

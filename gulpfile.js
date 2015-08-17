var gulp = require("gulp"),
    browserSync = require("browser-sync");
    
    gulp.task('default', function() {
        browserSync({
            notify: false,
            port: 3100,
            server: "",
            open:false
        });    
    });
module.exports = function(grunt) {
  grunt.initConfig({
    nwabap_ui5uploader: {
      upload: {
        options: {
          conn: {
            server: 'https://intadsgwd01:44300/',
            client: '080',
            useStrictSSL: false
          },
          auth: {
            user: 'exdevind',
            pwd: 'Arjas@101010'
          },
          ui5: {
            package: 'ZODATA_BW',
            bspcontainer: 'ZSD_DAILYUPD',
            bspcontainer_text: 'Sales Dashboard - Daily updates',
            transportno: 'GWDK900189'
          },
          resources: {
            cwd: 'dist',
            src: '**/*.*'
          }
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-nwabap-ui5uploader');
};

import subprocess, glob, os, sys

base = r'C:\Users\manoj\OneDrive\Desktop\Projects\Forest-Fire'
build = os.path.join(base, '.pio', 'build', 'nodemcuv2')
fw_dir = os.path.join(build, 'FrameworkArduino')
lib_path = os.path.join(build, 'libFrameworkArduino.a')

objs = glob.glob(os.path.join(fw_dir, '*.o'))
print(f'{len(objs)} object files found')

# Try both possible ar paths
ar_paths = [
    os.path.join(os.path.expanduser('~'), '.platformio', 'packages', 'toolchain-xtensa', 'bin', 'xtensa-lx106-elf-ar.exe'),
    os.path.join(os.path.expanduser('~'), '.platformio', 'packages', 'toolchain-xtensa', 'xtensa-lx106-elf', 'bin', 'bin', 'ar.exe'),
]

for ar_path in ar_paths:
    if os.path.exists(ar_path):
        print(f'Using: {ar_path}')
        r = subprocess.run([ar_path, 'rc', lib_path] + objs, capture_output=True, text=True, cwd=build)
        print(f'RC: {r.returncode}')
        if r.stderr:
            print(f'ERR: {r.stderr[:300]}')
        if os.path.exists(lib_path):
            size = os.path.getsize(lib_path)
            print(f'SUCCESS: libFrameworkArduino.a created ({size} bytes)')
            sys.exit(0)

print('FAILED: Could not create archive')
sys.exit(1)

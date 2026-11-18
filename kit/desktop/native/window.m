/*
 * Window shape helper for the desktop shell (macOS). Loaded by native.cjs as a Node-API module, built at package time by
 * kit/tools/build-native.mjs (universal, signed with the app, shipped unpacked). Node-API is reached through the host process symbols (-undefined dynamic_lookup), so the few
 * calls used are declared here instead of including the SDK headers.
 *
 *   info(handle)                -> { radius, effective, toolbar, titled, effectViews }  window corner state, for measurement
 *   setCornerRadius(handle, r)  -> boolean   the window corner radius (continuous corner, as the system draws it)
 *   setSurfaceShape(handle, r)  -> boolean   a borderless translucent surface (menu): rounds its material views and its shadow to r
 *   materialInfo(handle)        -> string    the material layers (backdrop filters and their values, tint layers), JSON, for measurement
 *   useAppAppearance()          -> boolean   the current drawing appearance becomes the app appearance (before a menu opens, see below)
 *   setTint(handle, r, g, b, a) -> boolean   a color layer over the window material or glass (sRGB, 0 to 1), moved back on top when the
 *                                            system added layers over it; without the color it is removed
 *   tuneMaterial(handle, json)  -> boolean   sets backdrop filter inputs on the window material ({ "<filter name>.<input>": number }) and
 *                                            tint layer colors ({ "tint": [r, g, b, a] } over the material), to fit measured colors
 *   setGlass(handle, json?)     -> boolean   the glass window background (NSGlassEffectView, macOS 26 and later) under the window content:
 *                                            { style: 0 regular | 1 clear, tint?: [r, g, b, a] }; without json it is removed. False when the
 *                                            system has no glass view (the caller keeps the material)
 *
 *   desktopImagePath()          -> string    the file of the desktop picture on the main screen (NSWorkspace desktopImageURLForScreen),
 *                                            '' when the system gives none (a dynamic or aerial wallpaper without a file)
 *
 * handle is BaseWindow.getNativeWindowHandle() (an NSView pointer). The corner radius setter is not public API: the module checks that the
 * window answers it and reports false otherwise, so the shell keeps the system shape.
 */
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/message.h>

typedef struct napi_env__ *napi_env;
typedef struct napi_value__ *napi_value;
typedef struct napi_callback_info__ *napi_callback_info;
typedef int napi_status;
typedef napi_value (*napi_callback)(napi_env, napi_callback_info);
extern napi_status napi_get_cb_info(napi_env, napi_callback_info, size_t *, napi_value *, napi_value *, void **);
extern napi_status napi_get_buffer_info(napi_env, napi_value, void **, size_t *);
extern napi_status napi_get_value_double(napi_env, napi_value, double *);
extern napi_status napi_create_double(napi_env, double, napi_value *);
extern napi_status napi_get_boolean(napi_env, bool, napi_value *);
extern napi_status napi_create_object(napi_env, napi_value *);
extern napi_status napi_create_function(napi_env, const char *, size_t, napi_callback, void *, napi_value *);
extern napi_status napi_set_named_property(napi_env, napi_value, const char *, napi_value);
extern napi_status napi_create_string_utf8(napi_env, const char *, size_t, napi_value *);
extern napi_status napi_get_value_string_utf8(napi_env, napi_value, char *, size_t, size_t *);

static NSWindow *windowOf(napi_env env, napi_value v) {
  void *data = NULL; size_t len = 0;
  if (napi_get_buffer_info(env, v, &data, &len) != 0 || len < sizeof(void *)) return nil;
  NSView *view = (__bridge NSView *)(*(void **)data);
  return [view isKindOfClass:[NSView class]] ? view.window : nil;
}
static napi_value num(napi_env env, double d) { napi_value r; napi_create_double(env, d, &r); return r; }
static napi_value boolean(napi_env env, bool b) { napi_value r; napi_get_boolean(env, b, &r); return r; }
static double cornerOf(NSWindow *w, const char *name) {
  SEL s = sel_registerName(name);
  return [w respondsToSelector:s] ? ((CGFloat (*)(id, SEL))objc_msgSend)(w, s) : -1;
}
static Class glassClass(void) { return NSClassFromString(@"NSGlassEffectView"); }
static void effectViews(NSView *v, NSMutableArray *out) {
  Class g = glassClass();
  if ([v isKindOfClass:[NSVisualEffectView class]] || (g && [v isKindOfClass:g])) [out addObject:v];
  for (NSView *c in v.subviews) effectViews(c, out);
}
/* a stretchable rounded mask: the corners keep radius r at any size */
static NSImage *roundedMask(CGFloat r) {
  CGFloat e = r * 2 + 1;
  NSImage *img = [NSImage imageWithSize:NSMakeSize(e, e) flipped:NO drawingHandler:^BOOL(NSRect rect) {
    [[NSColor blackColor] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:rect xRadius:r yRadius:r] fill];
    return YES;
  }];
  img.capInsets = NSEdgeInsetsMake(r, r, r, r);
  img.resizingMode = NSImageResizingModeStretch;
  return img;
}

static napi_value info(napi_env env, napi_callback_info cb) {
  size_t argc = 1; napi_value argv[1]; napi_get_cb_info(env, cb, &argc, argv, NULL, NULL);
  NSWindow *w = argc ? windowOf(env, argv[0]) : nil;
  napi_value o; napi_create_object(env, &o);
  if (!w) return o;
  NSMutableArray *fx = [NSMutableArray array]; effectViews(w.contentView.superview ?: w.contentView, fx);
  napi_set_named_property(env, o, "radius", num(env, cornerOf(w, "_cornerRadius")));
  napi_set_named_property(env, o, "effective", num(env, cornerOf(w, "_effectiveCornerRadius")));
  napi_set_named_property(env, o, "toolbar", boolean(env, w.toolbar != nil));
  napi_set_named_property(env, o, "titled", boolean(env, (w.styleMask & NSWindowStyleMaskTitled) != 0));
  napi_set_named_property(env, o, "effectViews", num(env, fx.count));
  return o;
}

static bool setRadius(NSWindow *w, CGFloat r) {
  SEL s = sel_registerName("_setCornerRadius:");
  if (![w respondsToSelector:s]) return false;
  ((void (*)(id, SEL, CGFloat))objc_msgSend)(w, s, r);
  [w invalidateShadow];
  return true;
}

static napi_value setCornerRadius(napi_env env, napi_callback_info cb) {
  size_t argc = 2; napi_value argv[2]; napi_get_cb_info(env, cb, &argc, argv, NULL, NULL);
  NSWindow *w = argc == 2 ? windowOf(env, argv[0]) : nil; double r = 0;
  if (!w || napi_get_value_double(env, argv[1], &r) != 0) return boolean(env, false);
  return boolean(env, setRadius(w, r));
}

static napi_value setSurfaceShape(napi_env env, napi_callback_info cb) {
  size_t argc = 2; napi_value argv[2]; napi_get_cb_info(env, cb, &argc, argv, NULL, NULL);
  NSWindow *w = argc == 2 ? windowOf(env, argv[0]) : nil; double r = 0;
  if (!w || napi_get_value_double(env, argv[1], &r) != 0) return boolean(env, false);
  NSMutableArray *fx = [NSMutableArray array]; effectViews(w.contentView.superview ?: w.contentView, fx);
  NSImage *mask = roundedMask(r);
  for (NSVisualEffectView *v in fx) v.maskImage = mask;
  w.hasShadow = YES;
  setRadius(w, r);
  [w invalidateShadow];
  return boolean(env, fx.count > 0);
}


/* the material layers: every sublayer of the window's visual effect views */
static void layersOf(CALayer *l, NSMutableArray *out) { if (!l) return; [out addObject:l]; for (CALayer *c in l.sublayers) layersOf(c, out); }
static NSArray *materialLayers(NSWindow *w) {
  NSMutableArray *fx = [NSMutableArray array]; effectViews(w.contentView.superview ?: w.contentView, fx);
  NSMutableArray *ls = [NSMutableArray array];
  for (NSView *v in fx) layersOf(v.layer, ls);
  return ls;
}
static id plain(id v) {
  if ([v isKindOfClass:[NSNumber class]] || [v isKindOfClass:[NSString class]]) return v;
  if (v && CFGetTypeID((__bridge CFTypeRef)v) == CGColorGetTypeID()) {
    CGColorRef c = (__bridge CGColorRef)v; const CGFloat *k = CGColorGetComponents(c); size_t n = CGColorGetNumberOfComponents(c);
    NSMutableArray *a = [NSMutableArray array]; for (size_t i = 0; i < n; i++) [a addObject:@(k[i])]; return a;
  }
  if ([v isKindOfClass:[NSValue class]]) return [v description];
  return v ? [v description] : [NSNull null];
}
static napi_value materialInfo(napi_env env, napi_callback_info cb) {
  size_t argc = 1; napi_value argv[1]; napi_get_cb_info(env, cb, &argc, argv, NULL, NULL);
  NSWindow *w = argc ? windowOf(env, argv[0]) : nil;
  NSMutableArray *out = [NSMutableArray array];
  for (CALayer *l in w ? materialLayers(w) : @[]) {
    NSMutableDictionary *d = [@{ @"class": NSStringFromClass([l class]), @"opacity": @(l.opacity) } mutableCopy];
    if (l.backgroundColor) d[@"bg"] = plain((__bridge id)l.backgroundColor);
    if (l.compositingFilter) d[@"compositing"] = [l.compositingFilter description];
    NSMutableArray *fs = [NSMutableArray array];
    for (id f in l.filters ?: @[]) {
      NSMutableDictionary *fd = [NSMutableDictionary dictionary];
      @try { fd[@"name"] = [f valueForKey:@"name"] ?: @""; fd[@"type"] = [f valueForKey:@"type"] ?: @""; } @catch (id e) {}
      @try { for (NSString *k in [f valueForKey:@"inputKeys"] ?: @[]) { id v = nil; @try { v = [f valueForKey:k]; } @catch (id e) {} fd[k] = plain(v); } } @catch (id e) {}
      [fs addObject:fd];
    }
    if (fs.count) d[@"filters"] = fs;
    [out addObject:d];
  }
  NSData *j = [NSJSONSerialization dataWithJSONObject:out options:0 error:nil];
  NSString *s = j ? [[NSString alloc] initWithData:j encoding:NSUTF8StringEncoding] : @"[]";
  napi_value r; napi_create_string_utf8(env, s.UTF8String, (size_t)-1, &r); return r;
}
/* the tint layer over the window material: [r, g, b, a] (0 to 1) adds or recolors it, anything else removes it */
static bool applyTint(NSWindow *w, id tint) {
  bool any = false;
  NSView *top = w.contentView.superview ?: w.contentView;
  NSMutableArray *fx = [NSMutableArray array]; effectViews(top, fx);
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  for (NSView *v in fx) {
    CALayer *t = nil; for (CALayer *c in v.layer.sublayers) if ([c.name isEqualToString:@"kit-tint"]) t = c;
    if ([tint isKindOfClass:[NSArray class]] && [tint count] == 4) {
      if (!t) { t = [CALayer layer]; t.name = @"kit-tint"; }
      if (t != v.layer.sublayers.lastObject) { [t removeFromSuperlayer]; [v.layer addSublayer:t]; }
      t.frame = v.layer.bounds; t.autoresizingMask = kCALayerWidthSizable | kCALayerHeightSizable;
      CGColorRef c = CGColorCreateSRGB([tint[0] doubleValue], [tint[1] doubleValue], [tint[2] doubleValue], [tint[3] doubleValue]);
      t.backgroundColor = c; CGColorRelease(c);
      any = true;
    } else if (t) [t removeFromSuperlayer];
  }
  [CATransaction commit];
  return any;
}
static napi_value setTint(napi_env env, napi_callback_info cb) {
  size_t argc = 5; napi_value argv[5]; napi_get_cb_info(env, cb, &argc, argv, NULL, NULL);
  NSWindow *w = argc ? windowOf(env, argv[0]) : nil;
  if (!w) return boolean(env, false);
  if (argc < 5) return boolean(env, applyTint(w, nil));
  NSMutableArray *rgba = [NSMutableArray array];
  for (int i = 1; i < 5; i++) { double d = 0; napi_get_value_double(env, argv[i], &d); [rgba addObject:@(d)]; }
  return boolean(env, applyTint(w, rgba));
}
static napi_value tuneMaterial(napi_env env, napi_callback_info cb) {
  size_t argc = 2; napi_value argv[2]; napi_get_cb_info(env, cb, &argc, argv, NULL, NULL);
  NSWindow *w = argc == 2 ? windowOf(env, argv[0]) : nil;
  char buf[4096]; size_t n = 0;
  if (!w || napi_get_value_string_utf8(env, argv[1], buf, sizeof buf, &n) != 0) return boolean(env, false);
  NSDictionary *want = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:buf length:n] options:0 error:nil];
  if (![want isKindOfClass:[NSDictionary class]]) return boolean(env, false);
  bool any = false;
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  for (CALayer *l in materialLayers(w)) {
    for (id f in l.filters ?: @[]) {
      NSString *name = nil; @try { name = [f valueForKey:@"name"]; } @catch (id e) {}
      for (NSString *k in want) {
        NSArray *p = [k componentsSeparatedByString:@"."];
        if (p.count == 2 && [p[0] isEqualToString:name]) { @try { [l setValue:want[k] forKeyPath:[NSString stringWithFormat:@"filters.%@.%@", name, p[1]]]; any = true; } @catch (id e) {} }
      }
    }
  }
  if (want[@"tint"]) any = applyTint(w, want[@"tint"]) || any;
  [CATransaction commit];
  return boolean(env, any);
}

/* The glass background: one NSGlassEffectView named kit-glass at the bottom of the content view, filling it. The style and the tint
   are public properties; they are set through key-value coding so the helper builds with older SDKs */
static NSView *glassOf(NSWindow *w) { for (NSView *v in w.contentView.subviews) if ([v.identifier isEqualToString:@"kit-glass"]) return v; return nil; }
static napi_value setGlass(napi_env env, napi_callback_info cb) {
  size_t argc = 2; napi_value argv[2]; napi_get_cb_info(env, cb, &argc, argv, NULL, NULL);
  NSWindow *w = argc ? windowOf(env, argv[0]) : nil;
  Class G = glassClass();
  if (!w || !G) return boolean(env, false);
  NSView *v = glassOf(w);
  char buf[1024]; size_t n = 0;
  NSDictionary *want = nil;
  if (argc == 2 && napi_get_value_string_utf8(env, argv[1], buf, sizeof buf, &n) == 0 && n)
    want = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:buf length:n] options:0 error:nil];
  if (![want isKindOfClass:[NSDictionary class]]) { [v removeFromSuperview]; return boolean(env, true); }
  if (!v) {
    v = [[G alloc] initWithFrame:w.contentView.bounds];
    v.identifier = @"kit-glass";
    v.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [w.contentView addSubview:v positioned:NSWindowBelow relativeTo:nil];
  }
  @try { [v setValue:want[@"style"] ?: @0 forKey:@"style"]; } @catch (id e) {}
  NSArray *t = want[@"tint"];
  NSColor *tint = [t isKindOfClass:[NSArray class]] && t.count == 4 ? [NSColor colorWithSRGBRed:[t[0] doubleValue] green:[t[1] doubleValue] blue:[t[2] doubleValue] alpha:[t[3] doubleValue]] : nil;
  @try { [v setValue:tint forKey:@"tintColor"]; } @catch (id e) {}
  return boolean(env, true);
}
/* A menu takes the thread's current drawing appearance when it is built. The shell opens context menus from a message handler, outside
   any AppKit drawing, where the current appearance was still the system one after the app theme changed (measured: dark menu in the light
   theme, while the app, the window and the menu window all named the light appearance); it is set to the app appearance before each menu */
static napi_value useAppAppearance(napi_env env, napi_callback_info cb) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  NSAppearance.currentAppearance = NSApp.effectiveAppearance;
#pragma clang diagnostic pop
  return boolean(env, true);
}

static napi_value desktopImagePath(napi_env env, napi_callback_info cb) {
  NSURL *u = [[NSWorkspace sharedWorkspace] desktopImageURLForScreen:[NSScreen mainScreen]];
  const char *p = (u && u.isFileURL) ? u.path.fileSystemRepresentation : "";
  napi_value r; napi_create_string_utf8(env, p ? p : "", (size_t)-1, &r); return r;
}

static void define(napi_env env, napi_value exports, const char *name, napi_callback f) {
  napi_value fn; napi_create_function(env, name, (size_t)-1, f, NULL, &fn); napi_set_named_property(env, exports, name, fn);
}
__attribute__((visibility("default"))) napi_value napi_register_module_v1(napi_env env, napi_value exports) {
  define(env, exports, "info", info);
  define(env, exports, "setCornerRadius", setCornerRadius);
  define(env, exports, "setSurfaceShape", setSurfaceShape);
  define(env, exports, "materialInfo", materialInfo);
  define(env, exports, "tuneMaterial", tuneMaterial);
  define(env, exports, "setTint", setTint);
  define(env, exports, "useAppAppearance", useAppAppearance);
  define(env, exports, "setGlass", setGlass);
  define(env, exports, "desktopImagePath", desktopImagePath);
  return exports;
}
__attribute__((visibility("default"))) int node_api_module_get_api_version_v1(void) { return 8; }

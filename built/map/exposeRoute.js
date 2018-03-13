"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client = require("prom-client");
exports.exposeRoute = (path) => (req, res, next) => {
    if (req.path() === path) {
        res.status(200);
        res.header('Content-Type', 'text/plain');
        res.end(client.register.metrics());
        return;
    }
    next();
};

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxOaWNhbmRlclxccmVzdGlmeS1wcm9tLWJ1bmRsZVxcc3JjXFxleHBvc2VSb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUlBLHNDQUFzQztBQUd6QixRQUFBLFdBQVcsR0FBYSxDQUFDLElBQVksRUFBOEIsRUFBRSxDQUM5RSxDQUFDLEdBQW9CLEVBQUUsR0FBcUIsRUFBRSxJQUFrQixFQUFRLEVBQUU7SUFDeEUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDeEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoQixHQUFHLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN6QyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNuQyxNQUFNLENBQUM7SUFDVCxDQUFDO0lBQ0QsSUFBSSxFQUFFLENBQUM7QUFDVCxDQUFDLENBQUMiLCJmaWxlIjoiZXhwb3NlUm91dGUuanMifQ==

//
//  Space.h
//  libraries/workload/src/workload
//
//  Created by Andrew Meadows 2018.01.30
//  Copyright 2018 High Fidelity, Inc.
//
//  Originally from lighthouse3d. Modified to utilize glm::vec3 and clean up to our coding standards
//  Simple plane class.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

#ifndef hifi_workload_Space_h
#define hifi_workload_Space_h

#include <memory>
#include <vector>
#include <glm/glm.hpp>

#include "View.h"


namespace workload {

class Space {
public:
    using Sphere = glm::vec4; // <x,y,z> = center, w = radius
    using ProxyUpdate = std::pair<int32_t, Sphere>;

    class Proxy {
    public:
        Proxy() : sphere(0.0f) {}
        Proxy(const Sphere& s) : sphere(s) {}
        Sphere sphere;
        uint8_t region { Region::UNKNOWN };
        uint8_t prevRegion { Region::UNKNOWN };
        uint16_t _padding;
        uint32_t _paddings[3];
    };

    class Change {
    public:
        Change(int32_t i, uint32_t c, uint32_t p) : proxyId(i), region(c), prevRegion(p) {}
        int32_t proxyId { -1 };
        uint8_t region { 0 };
        uint8_t prevRegion { 0 };
    };

    Space() {}

    void clear();
    int32_t createProxy(const Sphere& sphere);
    void deleteProxies(const std::vector<int32_t>& deadIndices);
    void updateProxies(const std::vector<ProxyUpdate>& changedProxies);
    void setViews(const std::vector<View>& views);

    uint32_t getNumViews() const { return (uint32_t)(_views.size()); }
    void copyViews(std::vector<View>& copy) const;


    uint32_t getNumObjects() const { return (uint32_t)(_proxies.size() - _freeIndices.size()); }
    uint32_t getNumAllocatedProxies() const { return (uint32_t)(_proxies.size()); }

    void categorizeAndGetChanges(std::vector<Change>& changes);
    uint32_t copyProxyValues(Proxy* proxies, uint32_t numDestProxies) const;

private:
    void deleteProxy(int32_t proxyId);
    void updateProxy(int32_t proxyId, const Sphere& sphere);

    std::vector<Proxy> _proxies;
    Views _views;
    std::vector<int32_t> _freeIndices;
};

using SpacePointer = std::shared_ptr<Space>;
using Changes = std::vector<Space::Change>;
using SortedChanges = std::vector<std::vector<int32_t>>;

} // namespace workload

#endif // hifi_workload_Space_h
